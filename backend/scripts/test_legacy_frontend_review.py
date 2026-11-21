"""Playwright smoke test: old frontend/build + local iroha16-fix14 Flask.

From the repo root: python backend/scripts/test_legacy_frontend_review.py
Prerequisites: existing old frontend/build, backend test deps (as in
scripts/test_isolated.py), Python Playwright and its local Chromium.
Does not rebuild the bundle, load .env, or use network services.
"""

import argparse
import hashlib
import io
import os
import shutil
import socket
import sys
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from unittest.mock import patch
from urllib.parse import urlsplit

from test_isolated import CONFIG, ROOT


DEFAULT_BUILD = ROOT.parent / 'frontend' / 'build'
MEMBER_EMAIL = 'legacy-member@example.invalid'
PASSWORD = CONFIG['ADMIN_INITIAL_PASSWORD']
NOTICE = 'Isolated legacy review notice'


def report(text):
    print(text, flush=True)


@contextmanager
def isolated_app(origin, build, port):
    for dependencies in (ROOT / '.review-deps', ROOT / '.review-minimal'):
        if dependencies.is_dir():
            sys.path.insert(0, str(dependencies))
    from werkzeug.exceptions import NotFound
    from werkzeug.serving import WSGIRequestHandler, make_server
    from flask import Response
    from werkzeug.utils import send_from_directory

    # Keep fixture setup in the same process as the server: mongomock, the
    # actual CAPTCHA records, and storage must be shared. No test-only HTTP API.
    class QuietHandler(WSGIRequestHandler):
        def log_request(self, code='-', size='-'):
            if str(code).startswith('5'):
                super().log_request(code, size)

    def backend_socket_guard(name):
        original = getattr(socket.socket, name)

        def guarded(sock, address):
            if sock.family in (socket.AF_INET, socket.AF_INET6) and address != ('127.0.0.1', port):
                raise RuntimeError(f'Non-fixture backend connection blocked: {address!r}')
            return original(sock, address)
        return guarded

    env = {k: os.environ[k] for k in ('SYSTEMROOT', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'HOME', 'USERPROFILE') if k in os.environ}
    env.update(CONFIG, SITE_ORIGIN=origin, STORAGE_DOMAIN=origin + '/storage/', BABEL_DEFAULT_LOCALE='zh')
    ignore = shutil.ignore_patterns('__pycache__', '*.pyc', '.env*', '*.pem', '*.key')
    with TemporaryDirectory(prefix='moeflow-legacy-review-') as tmp:
        sandbox = Path(tmp).resolve()
        for name in ('app', 'files/fonts'):
            shutil.copytree(ROOT / name, sandbox / name, ignore=ignore)
        (sandbox / 'files/tmp').mkdir()
        (sandbox / 'storage').mkdir()
        previous = Path.cwd()
        os.chdir(sandbox)
        sys.path.insert(0, str(sandbox))
        try:
            with (
                patch.dict(os.environ, env, clear=True),
                patch('dotenv.load_dotenv', return_value=False),
                patch.object(socket.socket, 'connect', backend_socket_guard('connect')),
                patch.object(socket.socket, 'connect_ex', backend_socket_guard('connect_ex')),
            ):
                from app import create_app
                from app.factory import init_db
                from app.models.notice import Notice
                from app.models.project import Project, ProjectSet
                from app.models.team import Team
                from app.models.user import User

                app = create_app()
                assert app.config['BUILD_ID'] == 'iroha16-fix14'
                with app.app_context():
                    init_db(app)
                    admin = User.get_by_email(CONFIG['ADMIN_EMAIL'])
                    member = User.create(name='Legacy Member', email=MEMBER_EMAIL, password=PASSWORD)
                    team = Team.create('Legacy fixture team', creator=member)
                    project_set = ProjectSet.create('Legacy fixture collection', team=team)
                    project = Project.create('Legacy fixture project', team, project_set=project_set, creator=member)
                    target_id = str(project.targets().first().id)
                    notice_id = str(Notice(title=NOTICE, content='Local only', create_user=admin).save().id)

                def serve(environ, start_response):
                    path = environ['PATH_INFO']
                    if path.startswith('/api/'):
                        return app({**environ, 'PATH_INFO': path[4:]}, start_response)
                    if path.startswith('/storage/'):
                        return app(environ, start_response)
                    if path == '/moeflow-runtime-config.json':
                        return Response('{"baseURL":"/api"}', mimetype='application/json')(environ, start_response)
                    asset = path.lstrip('/') if '.' in Path(path).name else 'index.html'
                    try:
                        return send_from_directory(build, asset, environ)(environ, start_response)
                    except NotFound as error:
                        return error(environ, start_response)

                server = make_server('127.0.0.1', port, serve, threaded=True, request_handler=QuietHandler)
                thread = Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    yield str(project.id), target_id, notice_id
                finally:
                    server.shutdown()
                    thread.join()
                    server.server_close()
        finally:
            sys.path.remove(str(sandbox))
            os.chdir(previous)


def endpoint(path, method='GET'):
    return lambda response: urlsplit(response.url).path == '/api' + path and response.request.method == method


def check(response, status=200):
    assert response.status == status, f'{response.url}: expected {status}, got {response.status} {response.text()[:400]}'
    return response


def goto(page, origin, path):
    check(page.goto(origin + path, wait_until='domcontentloaded'))
    page.wait_for_load_state('networkidle')


def login(context, origin, email, inspect):
    from app.models.v_code import VCode, VCodeType

    page = context.new_page()
    with page.expect_response(endpoint('/v1/captchas', 'POST')) as event:
        goto(page, origin, '/login')
    captcha = check(event.value).json()
    # Read only the generated answer in this run's mongomock, as the backend
    # tests do. CAPTCHA generation and validation, password check and token
    # handling are the real Flask and browser flows.
    answer = VCode.objects(type=VCodeType.CAPTCHA, info=captcha['info']).get().content
    if inspect:
        report(str(page.locator('form input, form button').evaluate_all('(nodes) => nodes.map(n => [n.tagName, n.id, n.type, n.placeholder, n.textContent])')))
    page.locator('#auth-form_email').fill(email)
    page.locator('#auth-form_password').fill(PASSWORD)
    page.locator('form input[type=text]:not([id])').fill(answer)
    with page.expect_response(endpoint('/v1/user/token', 'POST')) as event:
        page.locator('button[type=submit]').click()
    response = check(event.value)
    page.wait_for_url('**/dashboard/projects')
    page.wait_for_load_state('networkidle')
    return page, response.json()['token']


def image_bytes(color):
    from PIL import Image

    buffer = io.BytesIO()
    Image.new('RGB', (96, 72), color).save(buffer, format='PNG')
    return buffer.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=3112)
    parser.add_argument('--build', type=Path, default=DEFAULT_BUILD)
    parser.add_argument('--inspect', action='store_true', help='Print settled DOM locators during local diagnosis.')
    args = parser.parse_args()
    if not 3102 <= args.port <= 65535:
        parser.error('--port must be at least 3102')
    build = args.build.resolve()
    if not (build / 'index.html').is_file():
        parser.error(f'Old frontend build not found: {build}; supply an existing bundle using --build.')

    from playwright.sync_api import sync_playwright

    origin = f'http://127.0.0.1:{args.port}'
    report(f'Old build {build} (index.html sha256={hashlib.sha256((build / "index.html").read_bytes()).hexdigest()}); local Flask: {origin}')
    with sync_playwright() as playwright, isolated_app(origin, build, args.port) as fixture:
        browser = playwright.chromium.launch(headless=True, args=['--disable-background-networking', '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'])
        blocked = set()

        def guard(route):
            if route.request.url.startswith(origin + '/'):
                route.continue_()
            else:
                blocked.add(urlsplit(route.request.url).netloc)
                route.abort('blockedbyclient')

        def context():
            ctx = browser.new_context(locale='zh-CN', service_workers='block', viewport={'width': 1480, 'height': 940})
            ctx.set_default_timeout(25000)
            ctx.route('**/*', guard)
            return ctx

        try:
            run_checks(playwright, context, origin, fixture, args.inspect)
        finally:
            browser.close()
            report(f'Blocked non-fixture browser hosts: {sorted(blocked)}')


SETTING = '/v1/admin/site-setting'
REVIEW = '/v1/admin/files/safe-status'
NOTICES = '/v1/user/notices'
POLICY = ('allow_pending_images', 'auto_approve_images')


def run_checks(playwright, context, origin, fixture, inspect):
    from playwright.sync_api import expect

    project_id, target_id, notice_id = fixture
    project_path = f'/dashboard/projects/{project_id}'
    files = f'/v1/projects/{project_id}/files'
    member, member_token = login(context(), origin, MEMBER_EMAIL, inspect)
    admin, admin_token = login(context(), origin, CONFIG['ADMIN_EMAIL'], inspect)
    report('PASS: old UI member and admin login, real CAPTCHA + token + dashboard redirect')

    def client(token):
        return playwright.request.new_context(base_url=origin, extra_http_headers={'Authorization': f'Bearer {token}', 'Accept-Language': 'zh-CN'}, timeout=25000)

    member_api, admin_api = client(member_token), client(admin_token)

    def api(ctx, path, method='GET', status=200, **options):
        return check(ctx.fetch('/api' + path, method=method, max_redirects=0, **options), status)

    def notices(page, ctx, title, identifier):
        dialog = page.get_by_role('dialog').filter(has_text=title)
        expect(dialog).to_be_visible()
        assert identifier in {item['id'] for item in api(ctx, NOTICES + '?scope=unread').json()}
        with page.expect_response(endpoint(NOTICES + '/read', 'PUT')) as event:
            dialog.locator('.ant-modal-footer button').click()
        response = check(event.value)
        assert response.request.post_data_json == {'notice_ids': [identifier]}
        expect(dialog).to_be_hidden()
        records = api(ctx, NOTICES).json()
        assert next(item for item in records if item['id'] == identifier)['read'] is True
        assert identifier not in {item['id'] for item in api(ctx, NOTICES + '?scope=unread').json()}

    def set_policy(allow, auto):
        before = api(admin_api, SETTING).json()
        data = {key: before[key] for key in ('only_allow_admin_create_team', 'auto_join_team_ids', 'homepage_html', 'homepage_css')}
        data.update(zip(POLICY, (allow, auto)))
        after = api(admin_api, SETTING, 'PUT', data=data).json()
        assert tuple(after[key] for key in POLICY) == (allow, auto)

    def list_page():
        with member.expect_response(endpoint(files)) as event:
            goto(member, origin, project_path)
        return check(event.value).json()

    def card(name):
        return member.locator('.FileItem').filter(has_text=name)

    def search_ui(word):
        with member.expect_response(endpoint('/v1/files/search')) as event:
            member.locator('.FileList__Search input').fill(word)
        return check(event.value).json()

    def upload_ui(name, color):
        data = {'name': name, 'mimeType': 'image/png', 'buffer': image_bytes(color)}
        with member.expect_response(endpoint(files, 'POST')) as event:
            member.locator('.FileList__FilePond input[type=file]').set_input_files(data)
        response = event.value
        assert response.status in (200, 201), f'Upload status: {response.status}, {response.text()}'
        row = response.json()
        assert row['name'] == name
        expect(card(name).get_by_text('上传成功', exact=True)).to_be_visible()
        return row, response.status

    def denied(ctx, path, method='GET', **options):
        response = ctx.fetch('/api' + path, method=method, max_redirects=0, **options)
        assert 400 <= response.status < 500 and response.json().get('code') == 103, (path, response.status, response.text())
        return response.status

    notices(member, member_api, NOTICE, notice_id)
    notices(admin, admin_api, NOTICE, notice_id)
    report('PASS: old notice popup and mark-read on member and admin (PUT 200, verified read/unread lists)')

    assert tuple(api(admin_api, SETTING).json()[key] for key in POLICY) == (True, False)
    set_policy(False, True)
    goto(admin, origin, '/admin/site-setting')
    field = admin.locator('#homepageHtml')
    expect(field).to_be_visible()
    assert not admin.locator('[id*="allowPendingImages"], [id*="autoApproveImages"]').count()
    field.fill('<p>Legacy settings smoke</p>')
    with admin.expect_response(endpoint(SETTING, 'PUT')) as event:
        admin.locator('form button[type=submit]').click()
    response = check(event.value)
    sent = response.request.post_data_json
    assert all(key not in sent for key in POLICY)
    persisted = api(admin_api, SETTING).json()
    assert tuple(persisted[key] for key in POLICY) == (False, True)
    assert persisted['homepage_html'] == '<p>Legacy settings smoke</p>'
    report(f'PASS: old site form PUT 200 omitted new keys, saved homepage_html and preserved allow_pending_images=false / auto_approve_images=true; keys={sorted(sent)}')

    list_page()
    approved, automatic_http = upload_ui('fixture-approved.png', 'green')
    assert approved['safe_status'] == 4 and approved['available_in_project'] is True
    assert approved['id'] in {item['id'] for item in list_page()}
    expect(card(approved['name'])).to_be_visible()
    report(f'PASS: automatically approved upload (HTTP {automatic_http}, safe_status=4) remains visible even when pending access is disabled')

    set_policy(True, False)
    pending, allowed_http = upload_ui('fixture-pending.png', 'red')
    file_id = pending['id']
    path = f'/v1/files/{file_id}'
    editor = f'/image-translator/{file_id}-{target_id}'
    source_path = f'{path}/sources?target_id={target_id}&paging=false'
    assert pending['safe_status'] == 3 and pending['available_in_project'] is True and pending['url']
    assert file_id in {item['id'] for item in list_page()}
    expect(card(pending['name'])).to_be_visible()
    assert file_id in {item['id'] for item in search_ui('fixture-pending')}
    expect(member.locator('.FileSearch__Name').get_by_text(pending['name'], exact=True)).to_be_visible()
    api(member_api, path + '/content')
    source = api(member_api, path + '/sources', 'POST', data={'x': 0.5, 'y': 0.5, 'content': 'Legacy source before edit'}).json()
    source_id = source['id']
    with member.expect_response(endpoint(path)) as detail, member.expect_response(endpoint(path + '/sources')) as sources:
        card(pending['name']).locator('.FileItem__Image').click()
        member.wait_for_url(origin + editor)
    check(detail.value)
    assert source_id in {item['id'] for item in check(sources.value).json()}
    if inspect:
        report('Editor body: ' + member.locator('body').inner_text()[:1400])
        report(str(member.locator('textarea, [contenteditable=true]').evaluate_all('(nodes) => nodes.map(n => [n.outerHTML.slice(0,350), n.value])'))[:2400])
    edit_path = f'/v1/sources/{source_id}'
    member.get_by_role('button', name='全能模式').click()
    with member.expect_response(endpoint(edit_path, 'PUT')) as edit:
        member.locator('.Source__PositionSwitch').click()
    edit_response = check(edit.value)
    position_type = edit_response.request.post_data_json['position_type']
    assert position_type != source['position_type']
    assert next(item for item in api(member_api, source_path).json() if item['id'] == source_id)['position_type'] == position_type
    api(member_api, edit_path, 'PUT', data={'content': 'Legacy source after edit'})
    assert next(item for item in api(member_api, source_path).json() if item['id'] == source_id)['content'] == 'Legacy source after edit'
    report(f'PASS: permissive + manual (upload HTTP {allowed_http}, status=3): old UI list/search/editor/source-position PUT, byte GET and old source content PUT work')

    set_policy(False, False)
    # This is the same ID that had been visible and editable before the switch.
    ids = {item['id'] for item in list_page()}
    assert approved['id'] in ids and file_id not in ids
    expect(card(pending['name'])).to_have_count(0)
    assert search_ui('fixture-pending') == []
    expect(member.locator('.FileSearch__Name')).to_have_count(0)
    assert api(member_api, '/v1/files/search?word=fixture-approved').json()[0]['id'] == approved['id']
    with member.expect_response(endpoint(path)) as detail, member.expect_response(endpoint(path + '/sources')) as sources:
        goto(member, origin, editor)
    for response in (detail.value, sources.value):
        assert 400 <= response.status < 500 and response.json()['code'] == 103
    expect(member.get_by_text('此图片当前不可在项目中使用', exact=True).first).to_be_visible()
    denied(member_api, path + '/content')
    edit_http = denied(member_api, edit_path, 'PUT', data={'content': 'Must not be written'})
    report(f'PASS: restrictive + manual hides pending from list and search; old direct editor / sources HTTP {detail.value.status}/{sources.value.status}, source edit HTTP {edit_http} (all code=103)')
    if inspect:
        report('Denied editor body: ' + member.locator('body').inner_text()[:1200])

    list_page()
    hidden, hidden_http = upload_ui('fixture-hidden.png', 'blue')
    assert hidden['safe_status'] == 3 and hidden['available_in_project'] is False
    assert all(hidden[key] == '' for key in ('url', 'save_name', 'cover_url', 'safe_check_url'))
    immediate = card(hidden['name']).inner_text().replace('\n', ' | ')
    hidden_cover = card(hidden['name']).locator('.FileItem__Image')
    expect(hidden_cover).to_have_attribute('src', '')
    with member.expect_response(endpoint(f'/v1/files/{hidden["id"]}')) as event:
        hidden_cover.click()
    assert event.value.status == 400 and event.value.json()['code'] == 103
    assert hidden['id'] not in {item['id'] for item in list_page()}
    expect(card(hidden['name'])).to_have_count(0)
    report(f'UX GAP: restrictive + manual upload HTTP {hidden_http} shows success on a blank-cover card, click is denied, then card disappears on reload; immediate card: {immediate!r}')

    second = NOTICE + ' (restrictive)'
    published = api(admin_api, '/v1/admin/notices', 'POST', data={'title': second, 'content': 'Still independent of review policy'}).json()
    goto(member, origin, project_path)
    notices(member, member_api, second, published['id'])
    report('PASS: site notice still shows and marks read under restrictive + manual policy')

    with admin.expect_response(endpoint('/v1/admin/files')) as event:
        goto(admin, origin, '/admin/image-moderation')
    previews = {item['id']: item for item in check(event.value).json()}
    notices(admin, admin_api, second, published['id'])
    assert set(previews) == {file_id, hidden['id']}
    for filename in (pending['name'], hidden['name']):
        preview = admin.get_by_alt_text(filename, exact=True)
        expect(preview).to_be_visible()
        assert preview.evaluate('(img) => img.complete && img.naturalWidth > 0')

    # Admin has seen red; the uploader replaces it with purple while the same
    # old review page remains open. The ID survives overwrite, but the version
    # changes. Reject only the blue picture through the old UI.
    replacement = api(member_api, files, 'POST', multipart={'file': {'name': pending['name'], 'mimeType': 'image/png', 'buffer': image_bytes('purple')}}).json()
    assert replacement['id'] == file_id and replacement['upload_overwrite'] is True
    latest = next(item for item in api(admin_api, '/v1/admin/files?safe_status=3').json() if item['id'] == file_id)
    assert latest['save_name'] != previews[file_id]['save_name']
    conflict = api(admin_api, REVIEW, 'PUT', status=409, data={'safe_files': [file_id], 'unsafe_files': [], 'file_versions': {file_id: previews[file_id]['save_name']}}).json()
    assert conflict['conflicting_file_ids'] == [file_id]
    admin.get_by_alt_text(hidden['name'], exact=True).click()
    with admin.expect_response(endpoint(REVIEW, 'PUT')) as event:
        admin.locator('.AdminImageSafeCheck__SubmitButton').click()
    response = check(event.value)
    assert response.request.post_data_json == {'safe_files': [file_id], 'unsafe_files': [hidden['id']]}
    expect(admin.get_by_alt_text(pending['name'], exact=True)).to_have_count(0)
    ids = {item['id'] for item in list_page()}
    assert file_id in ids
    expect(card(pending['name'])).to_be_visible()
    assert api(member_api, path).json()['safe_status'] == 4
    assert api(member_api, path + '/content').body() == image_bytes('purple')
    assert next(item for item in api(member_api, source_path).json() if item['id'] == source_id)['content'] == 'Legacy source after edit'
    blocked = api(admin_api, '/v1/admin/files?safe_status=5').json()
    assert [item['id'] for item in blocked] == [hidden['id']]
    rejected_bytes = api(member_api, f'/v1/files/{hidden["id"]}/content', status=400).json()
    assert rejected_bytes['code'] == 8004  # Rejected bytes were deleted, not merely hidden.
    report('PASS: old admin preview rendered for hidden images; old versionless PUT returned 200, approved one (now visible/editable), rejected the other (content HTTP 400/code 8004, admin history kept)')
    report('REVIEW GAP: after same-name overwrite, the original displayed preview was stale. Versioned control returned 409, but old UI omitted file_versions and approved the replacement bytes (not what admin saw).')

    member_api.dispose()
    admin_api.dispose()


if __name__ == '__main__':
    main()
