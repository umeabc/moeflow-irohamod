"""Playwright regression for legacy palettes and guest shortcuts.

Default: existing frontend/build + isolated Flask/mongomock fixture (no .env,
remote credentials or business data). --url only checks the public login page
of the explicitly selected test host. Screenshots never contain credentials.
"""

import argparse
from contextlib import nullcontext
import json
from pathlib import Path
import re
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
    'resort-anthem': {'light': '#c04808', 'dark': '#ffaf04'},
    'sparkle-shower': {'light': '#007a6b', 'dark': '#bffe40'},
    'zinrai': {'light': '#9b00e3', 'dark': '#fe40dd'},
}
ACTION_COLORS = {'resort-anthem': '#ff8d04', 'sparkle-shower': '#ff9000', 'zinrai': '#fe40dd'}
ACTION_TEXT = {
    'resort-anthem': {'light': '#1a0f00', 'dark': '#1a1008'},
    'sparkle-shower': {'light': '#0a1607', 'dark': '#0a1400'},
    'zinrai': {'light': '#1a0b2e', 'dark': '#080014'},
}
FOCUS_COLORS = {
    'resort-anthem': {'light': '#008080', 'dark': '#00ffff'},
    'sparkle-shower': {'light': '#007a6b', 'dark': '#5ae7d9'},
    'zinrai': {'light': '#9b00e3', 'dark': '#00dae2'},
}
LAST_PALETTE = list(COLORS)[-1]
BUILD_MARKER = re.search(r'name="moeflow-build" content="([^"]+)"', (ROOT / 'frontend/index.html').read_text(encoding='utf8')).group(1)


def theme_state(page, palette, mode):
    from playwright.sync_api import expect
    expect(page.locator('html')).to_have_attribute('data-palette', palette)
    expect(page.locator('html')).to_have_attribute('data-theme', mode)
    actual = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--moeflow-primaryColor').trim().toLowerCase()")
    assert actual == COLORS[palette][mode].lower(), (palette, mode, actual)


def resolved_color(page, value):
    return page.evaluate("color => {const node = document.createElement('span');node.style.color=color;document.body.append(node);const value=getComputedStyle(node).color;node.remove();return value}", value)


def primary_control(page, control, palette, mode):
    expected = resolved_color(page, ACTION_COLORS.get(palette, COLORS[palette][mode]))
    actual = control.evaluate('(node) => {const s=getComputedStyle(node);return {color:s.backgroundColor,image:s.backgroundImage,text:s.color}}')
    assert actual['color'] == expected or expected in actual['image'], ('primary control fill', palette, mode, actual, expected)
    if palette in ACTION_TEXT:
        assert actual['text'] == resolved_color(page, ACTION_TEXT[palette][mode]), ('primary control text', palette, mode, actual)


def component_checks(page, palette, mode):
    """Exercise shared body-portal CSS cases without writing any backend data."""
    page.evaluate('''() => {
      const node = document.createElement('div');
      node.id = 'theme-css-probe';
      node.style.cssText = 'position:fixed;left:-10000px;top:0';
      node.innerHTML = '<sup class="ant-badge-count">9</sup><a class="am-button am-button-primary">Action</a>';
      document.body.append(node);
    }''')
    try:
        for selector in ('.ant-badge-count', '.am-button-primary'):
            primary_control(page, page.locator('#theme-css-probe ' + selector), palette, mode)
    finally:
        page.locator('#theme-css-probe').evaluate('(node) => node.remove()')


def picker_fits(select):
    result = select.evaluate('''node => {
      const style = getComputedStyle(node);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = style.font;
      return {text: node.selectedOptions[0].textContent,
              needed: ctx.measureText(node.selectedOptions[0].textContent).width,
              available: node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 24};
    }''')
    assert result['needed'] <= result['available'], ('Selected theme label is clipped', result)


def no_horizontal_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Horizontal overflow'


def public_checks(context, origin, artifacts):
    from playwright.sync_api import expect
    page = context.new_page()
    page_errors = []
    page.on('pageerror', lambda error: page_errors.append(str(error)))
    goto(page, origin, '/login')
    expect(page.locator('meta[name="moeflow-build"]')).to_have_attribute('content', BUILD_MARKER)
    toolbar = page.locator('.LoginQuickSettings')
    expect(toolbar).to_be_visible()
    language = toolbar.get_by_role('combobox', name='语言')
    expect(language).to_be_visible()
    toolbar.get_by_role('button', name='主题', exact=True).click()
    popup = page.locator('.ant-popover:visible')
    palette_select = popup.get_by_role('combobox', name='主题配色')
    dark_switch = popup.get_by_role('switch', name='暗色模式')
    assert palette_select.bounding_box()['y'] < dark_switch.bounding_box()['y']
    assert palette_select.locator('option').evaluate_all('(nodes) => nodes.map(node => node.value)') == list(COLORS)

    for palette in COLORS:
        palette_select.select_option(palette)
        for mode in ('light', 'dark'):
            if (dark_switch.get_attribute('aria-checked') == 'true') != (mode == 'dark'):
                dark_switch.click()
            theme_state(page, palette, mode)
            no_horizontal_overflow(page)
            page.wait_for_timeout(300)  # Existing login control transitions are 250ms.
            primary_control(page, page.locator('button[type="submit"]'), palette, mode)
            picker_fits(palette_select)
            # Capture the clean form before focus/blur can trigger required-field validation.
            page.screenshot(path=str(artifacts / f'login-{palette}-{mode}.png'), full_page=True)
            if palette in ACTION_COLORS:
                component_checks(page, palette, mode)
                email = page.locator('#auth-form_email')
                email.focus()
                page.wait_for_timeout(300)
                border = email.evaluate('(node) => getComputedStyle(node.closest(".ant-input-affix-wrapper") || node).borderColor')
                assert border == resolved_color(page, FOCUS_COLORS[palette][mode]), ('input focus', palette, mode, border)
                palette_select.focus()
            if palette in ACTION_COLORS:
                page.reload(wait_until='networkidle')
                theme_state(page, palette, mode)
                toolbar.get_by_role('button', name='主题', exact=True).click()

    # Language switch reloads the app but must preserve both appearance settings.
    language.select_option('en')
    page.wait_for_load_state('networkidle')
    expect(toolbar.get_by_role('button', name='Theme', exact=True)).to_be_visible()
    theme_state(page, LAST_PALETTE, 'dark')
    toolbar.get_by_role('combobox', name='Language').select_option('zh-CN')
    page.wait_for_load_state('networkidle')
    expect(toolbar.get_by_role('button', name='主题', exact=True)).to_be_visible()
    theme_state(page, LAST_PALETTE, 'dark')

    # Check narrow layouts, full selected names and the body-portal popover.
    page.set_viewport_size({'width': 390, 'height': 844})
    toolbar.get_by_role('button', name='主题', exact=True).click()
    expect(palette_select).to_be_visible()
    for width in (390, 320):
        page.set_viewport_size({'width': width, 'height': 844})
        for palette in COLORS:
            palette_select.select_option(palette)
            theme_state(page, palette, 'dark')
            page.wait_for_timeout(350)
            picker_fits(palette_select)
            no_horizontal_overflow(page)
            for element in (page.locator('.Login__Card'), toolbar, popup):
                box = element.bounding_box()
                assert box['x'] >= 0 and box['x'] + box['width'] <= width + 1, (width, box)
            if width == 390:
                page.screenshot(path=str(artifacts / f'mobile-login-{palette}-dark.png'), full_page=True)
    page.reload(wait_until='networkidle')
    theme_state(page, LAST_PALETTE, 'dark')
    assert not page_errors, page_errors
    print(f'PASS: {len(COLORS) * 2} guest palette/mode combinations, action/focus colors, new-theme reload, language round-trip, 390px/320px shortcuts', flush=True)
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
    for palette in ACTION_COLORS:
        palette_select.select_option(palette)
        theme_state(page, palette, 'dark')
        picker_fits(palette_select)
    dark_switch.click()
    theme_state(page, LAST_PALETTE, 'light')
    page.wait_for_timeout(350)
    page.screenshot(path=str(artifacts / f'dashboard-{LAST_PALETTE}-light.png'), full_page=True)
    goto(page, origin, '/dashboard/user/setting/base')
    palette_select = page.locator('.PalettePicker:visible').get_by_role('combobox')
    dark_switch = page.get_by_role('switch', name='暗色模式')
    for palette in ACTION_COLORS:
        palette_select.select_option(palette)
        for mode in ('light', 'dark'):
            if (dark_switch.get_attribute('aria-checked') == 'true') != (mode == 'dark'):
                dark_switch.click()
            theme_state(page, palette, mode)
            page.wait_for_timeout(350)
            picker_fits(palette_select)
            primary_control(page, page.locator('button[type="submit"]'), palette, mode)
            page.screenshot(path=str(artifacts / f'settings-{palette}-{mode}.png'), full_page=True)
    page.reload(wait_until='networkidle')
    theme_state(page, LAST_PALETTE, 'dark')
    page.close()
    print('PASS: all new themes in authenticated menu and settings, long names, independent dark mode, reload persistence', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=3115)
    parser.add_argument('--url', help='Public-only deployed test-host verification; no remote login or writes')
    parser.add_argument('--artifacts', type=Path, default=Path(tempfile.gettempdir()) / 'moeflow-theme-iidx')
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
