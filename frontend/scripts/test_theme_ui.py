"""Playwright regression for legacy palettes and guest shortcuts.

Default: existing frontend/build + isolated Flask/mongomock fixture (no .env,
remote credentials or business data). --url only checks the public login page
of the explicitly selected test host. Screenshots never contain credentials.
"""

import argparse
from contextlib import nullcontext
import json
from pathlib import Path
import sys
import tempfile
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend' / 'scripts'))
from test_legacy_frontend_review import MEMBER_EMAIL, goto, isolated_app, login

COLORS = {
    'default': {'light': '#FF657C', 'dark': '#FF657C'},
    'azure': {'light': '#2570e6', 'dark': '#5eb5ff'},
    'miku': {'light': '#118c84', 'dark': '#39c5bb'},
}


def theme_state(page, palette, mode):
    from playwright.sync_api import expect
    expect(page.locator('html')).to_have_attribute('data-palette', palette)
    expect(page.locator('html')).to_have_attribute('data-theme', mode)
    actual = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--moeflow-primaryColor').trim().toLowerCase()")
    assert actual == COLORS[palette][mode].lower(), (palette, mode, actual)


def no_horizontal_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Horizontal overflow'


def public_checks(context, origin, artifacts):
    from playwright.sync_api import expect
    page = context.new_page()
    page_errors = []
    page.on('pageerror', lambda error: page_errors.append(str(error)))
    goto(page, origin, '/login')
    expect(page.locator('meta[name="moeflow-build"]')).to_have_attribute('content', 'iroha16-fix15')
    toolbar = page.locator('.LoginQuickSettings')
    expect(toolbar).to_be_visible()
    language = toolbar.get_by_role('combobox', name='语言')
    expect(language).to_be_visible()
    toolbar.get_by_role('button', name='主题', exact=True).click()
    popup = page.locator('.ant-popover:visible')
    palette_select = popup.get_by_role('combobox', name='主题配色')
    dark_switch = popup.get_by_role('switch', name='暗色模式')
    assert palette_select.bounding_box()['y'] < dark_switch.bounding_box()['y']

    for palette in COLORS:
        palette_select.select_option(palette)
        for mode in ('light', 'dark'):
            if (dark_switch.get_attribute('aria-checked') == 'true') != (mode == 'dark'):
                dark_switch.click()
            theme_state(page, palette, mode)
            no_horizontal_overflow(page)
            # Verify a real primary control, not only the custom property.
            primary = page.locator('button[type="submit"]')
            page.wait_for_timeout(300)  # Existing login control transitions are 250ms.
            actual = primary.evaluate('(node) => {const s=getComputedStyle(node);return {color:s.backgroundColor,image:s.backgroundImage}}')
            expected = page.evaluate("color => {const node = document.createElement('span');node.style.color=color;document.body.append(node);const value=getComputedStyle(node).color;node.remove();return value}", COLORS[palette][mode])
            assert actual['color'] == expected or expected in actual['image'], ('submit button did not follow palette', palette, mode, actual, expected)
            page.screenshot(path=str(artifacts / f'login-{palette}-{mode}.png'), full_page=True)

    # Language switch reloads the app but must preserve both appearance settings.
    language.select_option('en')
    page.wait_for_load_state('networkidle')
    expect(toolbar.get_by_role('button', name='Theme', exact=True)).to_be_visible()
    theme_state(page, 'miku', 'dark')
    toolbar.get_by_role('combobox', name='Language').select_option('zh-CN')
    page.wait_for_load_state('networkidle')
    expect(toolbar.get_by_role('button', name='主题', exact=True)).to_be_visible()
    theme_state(page, 'miku', 'dark')

    # Check genuine mobile layout and both native select / body-portal popover.
    page.set_viewport_size({'width': 390, 'height': 844})
    no_horizontal_overflow(page)
    toolbar.get_by_role('button', name='主题', exact=True).click()
    expect(palette_select).to_be_visible()
    for palette in ('azure', 'miku'):
        palette_select.select_option(palette)
        theme_state(page, palette, 'dark')
        page.wait_for_timeout(350)
        no_horizontal_overflow(page)
        card_box = page.locator('.Login__Card').bounding_box()
        assert card_box['x'] >= 0 and card_box['x'] + card_box['width'] <= 391, card_box
        toolbar_box = toolbar.bounding_box()
        assert toolbar_box['x'] >= 0 and toolbar_box['x'] + toolbar_box['width'] <= 391
        page.screenshot(path=str(artifacts / f'mobile-login-{palette}-dark.png'), full_page=True)
    page.reload(wait_until='networkidle')
    theme_state(page, 'miku', 'dark')
    assert not page_errors, page_errors
    print('PASS: six guest palette/mode combinations, button colors, persistence, language round-trip, mobile shortcuts', flush=True)
    page.close()


def authenticated_checks(context, origin, artifacts):
    from playwright.sync_api import expect
    page, _ = login(context, origin, MEMBER_EMAIL, False)
    # Fixture-only notice dismissal; never runs on a remote site.
    notice = page.locator('.ant-modal:visible')
    expect(notice).to_be_visible(timeout=15000)
    notice.locator('.ant-modal-close').click()
    expect(notice).to_be_hidden()
    user_menu = page.locator('.Dashboard__MenuUserWrapper')
    user_menu.hover()
    dropdown = page.locator('.ant-dropdown:visible')
    palette_select = dropdown.get_by_role('combobox', name='主题配色')
    dark_switch = dropdown.get_by_role('switch', name='暗色模式')
    expect(palette_select).to_be_visible()
    assert palette_select.bounding_box()['y'] < dark_switch.bounding_box()['y']
    palette_select.select_option('azure')
    theme_state(page, 'azure', 'dark')
    dark_switch.click()
    theme_state(page, 'azure', 'light')
    page.wait_for_timeout(350)
    page.screenshot(path=str(artifacts / 'dashboard-azure-light.png'), full_page=True)
    goto(page, origin, '/dashboard/user/setting/base')
    settings = page.locator('.PalettePicker:visible')
    expect(settings).to_be_visible()
    settings.get_by_role('combobox').select_option('miku')
    theme_state(page, 'miku', 'light')
    page.get_by_role('switch', name='暗色模式').click()
    theme_state(page, 'miku', 'dark')
    page.wait_for_timeout(350)
    page.screenshot(path=str(artifacts / 'settings-miku-dark.png'), full_page=True)
    page.reload(wait_until='networkidle')
    theme_state(page, 'miku', 'dark')
    page.close()
    print('PASS: authenticated menu ordering, shared settings state, independent dark mode, reload persistence', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=3115)
    parser.add_argument('--url', help='Public-only deployed test-host verification; no remote login or writes')
    parser.add_argument('--artifacts', type=Path, default=Path(tempfile.gettempdir()) / 'moeflow-theme-fix15')
    args = parser.parse_args()
    if args.url and args.url.rstrip('/') != 'http://172.29.133.24':
        parser.error('--url must be the explicitly authorized test host http://172.29.133.24')
    artifacts = args.artifacts.resolve()
    artifacts.mkdir(parents=True, exist_ok=True)
    origin = args.url.rstrip('/') if args.url else f'http://127.0.0.1:{args.port}'
    fixture = nullcontext() if args.url else isolated_app(origin, ROOT / 'frontend' / 'build', args.port)

    from playwright.sync_api import sync_playwright
    with sync_playwright() as playwright, fixture:
        browser = playwright.chromium.launch(headless=True, args=['--disable-background-networking', '--no-proxy-server'])
        context = browser.new_context(locale='zh-CN', viewport={'width': 1440, 'height': 960}, service_workers='block', reduced_motion='reduce')
        context.set_default_timeout(25000)
        # Isolated checks cannot leave localhost. Deployed checks may load the
        # site's configured mascot/image assets, but contain no authenticated requests.
        if not args.url:
            context.route('**/*', lambda route: route.continue_() if urlsplit(route.request.url).netloc == urlsplit(origin).netloc else route.abort())
        try:
            public_checks(context, origin, artifacts)
            if not args.url:
                authenticated_checks(context, origin, artifacts)
        finally:
            context.close()
            browser.close()
    print(json.dumps({'result': 'passed', 'origin': origin, 'artifacts': str(artifacts)}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
