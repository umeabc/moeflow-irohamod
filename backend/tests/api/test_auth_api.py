from mongomock import ObjectId
from app.constants.locale import Locale
from app.exceptions import BadTokenError, NeedTokenError, UserBannedError
from app.exceptions.auth import InvalidInviteCodeError
from app.models.invitation_code import InvitationCode
from app.models.team import Team
from app.exceptions.base import NoPermissionError
from app.models.site_setting import SiteSetting
from app.models.team import TeamRole
from app.models.user import User
from app.models.v_code import VCode, VCodeType
from flask_apikit.exceptions import ValidateError
from tests import DEFAULT_USERS_COUNT, MoeAPITestCase


class AuthAPITestCase(MoeAPITestCase):
    def test_register_with_invite_code(self):
        """注册必须使用有效邀请码，并自动加入绑定团队。"""
        team = Team.objects().first()
        invite = InvitationCode(code="FIX4TEST", team=team, enabled=True).save()
        data = self.post(
            "/v1/users",
            json={
                "email": "invite@example.com",
                "name": "invite_user",
                "password": "111111",
                "invite_code": "FIX4TEST",
            },
        )
        self.assertErrorEqual(data)
        self.assertIsNotNone(data.json.get("token"))
        self.assertEqual(User.objects.count(), DEFAULT_USERS_COUNT + 1)
        self.assertEqual(1, InvitationCode.objects(id=invite.id).first().use_count)
        # 缺少邀请码不能注册
        data = self.post(
            "/v1/users",
            json={
                "email": "no-invite@example.com",
                "name": "no_invite",
                "password": "111111",
            },
        )
        self.assertErrorEqual(data, ValidateError)
        # 无效邀请码不能注册
        data = self.post(
            "/v1/users",
            json={
                "email": "bad-invite@example.com",
                "name": "bad_invite",
                "password": "111111",
                "invite_code": "NOTEXIST",
            },
        )
        self.assertErrorEqual(data, InvalidInviteCodeError)
        self.assertEqual(User.objects.count(), DEFAULT_USERS_COUNT + 1)


    def test_invite_registration_field_validation(self):
        """现行邀请码注册保留邮箱、名称和密码的字段校验。"""
        invite = InvitationCode(code="FIELDS", team=Team.objects().first()).save()
        payload = {
            "email": "fields@example.com",
            "name": "valid_name",
            "password": "111111",
            "invite_code": invite.code,
        }
        invalid_fields = (
            ("email", " fields@example.com"),
            ("email", "fields@example.com "),
            ("email", "field s@example.com"),
            ("email", "invalid-email"),
            ("name", " valid_name"),
            ("name", "valid_name "),
            ("name", "valid name"),
            ("name", "valid,name"),
            ("password", "123"),
        )
        for field, value in invalid_fields:
            with self.subTest(field=field, value=value):
                data = self.post("/v1/users", json={**payload, field: value})
                self.assertErrorEqual(data, ValidateError)
                self.assertIn(field, data.json["message"])
                self.assertEqual(DEFAULT_USERS_COUNT, User.objects.count())
                self.assertEqual(0, invite.reload().use_count)
        for field in ("email", "name", "password", "invite_code"):
            with self.subTest(missing=field):
                data = self.post("/v1/users", json={k: v for k, v in payload.items() if k != field})
                self.assertErrorEqual(data, ValidateError)
                self.assertEqual(DEFAULT_USERS_COUNT, User.objects.count())
        data = self.post("/v1/users", json={**payload, "name": "中い다Aa1_"})
        self.assertErrorEqual(data)
        self.assertEqual(DEFAULT_USERS_COUNT + 1, User.objects.count())
        self.assertEqual("中い다Aa1_", User.by_email(payload["email"]).name)
        data = self.post("/v1/users", json={**payload, "name": "another_name"})
        self.assertErrorEqual(data, ValidateError)
        self.assertEqual(DEFAULT_USERS_COUNT + 1, User.objects.count())
        self.assertEqual(1, invite.reload().use_count)

    def test_invite_registration_and_login_email_case(self):
        """注册后的邮箱保存为小写，登录接受不同大小写。"""
        invite = InvitationCode(code="LOGINCASE", team=Team.objects().first()).save()
        for index, (registered, login) in enumerate((
            ("lower@example.com", "lower@example.com"),
            ("UPPER@EXAMPLE.COM", "UPPER@EXAMPLE.COM"),
            ("MIXED@EXAMPLE.COM", "Mixed@Example.Com"),
        )):
            with self.subTest(registered=registered, login=login):
                data = self.post("/v1/users", json={
                    "email": registered, "name": f"case_{index}",
                    "password": "111111", "invite_code": invite.code,
                })
                self.assertErrorEqual(data)
                self.assertEqual(registered.lower(), User.by_email(registered).email)
                captcha_info, captcha = self.get_captcha()
                data = self.post("/v1/user/token", json={
                    "email": login, "password": "111111",
                    "captcha_info": captcha_info, "captcha": captcha,
                })
                self.assertErrorEqual(data)
                self.assertTrue(data.json["token"])
        self.assertEqual(3, invite.reload().use_count)

    def test_login(self):
        """测试登录API"""
        # == 正确的注册一个账号 ==
        self.create_user("11", "1@1.com", "111111").generate_token()
        # == 用错误的人机验证码登录api ==
        captcha_info, captcha = self.get_captcha()
        data = self.post(
            "/v1/user/token",
            json={
                "email": "1@1.com",
                "password": "111111",
                "captcha_info": captcha_info,
                "captcha": "bbbkbb",
            },
        )
        self.assertErrorEqual(data, ValidateError)
        self.assertIsNotNone(data.json["message"].get("captcha"))  # 会有captcha
        self.assertIsNone(data.json["message"].get("email"))  # 不会有email
        self.assertIsNone(data.json["message"].get("password"))  # 不会有password
        # == 用错误的人机验证码和错误的密码登录api ==
        captcha_info, captcha = self.get_captcha()
        data = self.post(
            "/v1/user/token",
            json={
                "email": "1@1.com",
                "password": "1111112222222",
                "captcha_info": captcha_info,
                "captcha": "bbbkbb",
            },
        )
        self.assertErrorEqual(data, ValidateError)
        self.assertIsNotNone(data.json["message"].get("captcha"))  # 会有captcha
        self.assertIsNone(data.json["message"].get("email"))  # 不会有email
        self.assertIsNone(data.json["message"].get("password"))  # 不会有password
        # == 用不存在的账号密码登录api ==
        captcha_info, captcha = self.get_captcha()
        data = self.post(
            "/v1/user/token",
            json={
                "email": "2@1.com",
                "password": "111111",
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(data, ValidateError)
        self.assertIsNone(data.json["message"].get("captcha"))  # 不会有captcha
        self.assertIsNotNone(data.json["message"].get("email"))  # 会有email字段
        self.assertIsNone(data.json["message"].get("password"))  # 不会有password
        # == 用错误的密码登录api ==
        captcha_info, captcha = self.get_captcha()
        data = self.post(
            "/v1/user/token",
            json={
                "email": "1@1.com",
                "password": "1111112222222",
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(data, ValidateError)
        self.assertIsNone(data.json["message"].get("captcha"))  # 不会有captcha
        self.assertIsNone(data.json["message"].get("email"))  # 不会有email
        self.assertIsNotNone(data.json["message"].get("password"))  # 会有password字段
        # == 用正确的账号密码登录api ==
        captcha_info, captcha = self.get_captcha()
        data = self.post(
            "/v1/user/token",
            json={
                "email": "1@1.com",
                "password": "111111",
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(data)
        self.assertIsNotNone(data.json.get("token"))

    def test_token_when_password_changed(self):
        """测试修改密码使"""
        # == 正确的注册一个账号 ==
        self.create_user("11", "1@1.com", "111111").generate_token()
        # == 用正确的账号密码登录api ==
        captcha_info, captcha = self.get_captcha()
        data = self.post(
            "/v1/user/token",
            json={
                "email": "1@1.com",
                "password": "111111",
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(data)
        self.assertIsNotNone(data.json.get("token"))
        token = data.json.get("token")
        # 获取个人资料
        data = self.get("/v1/user/info", token=token)
        self.assertErrorEqual(data)
        self.assertEqual(data.json["name"], "11")
        # 修改密码
        data = self.put(
            "/v1/user/password",
            json={"old_password": "111111", "new_password": "222222"},
            token=token,
        )
        self.assertErrorEqual(data)
        # 无法获取个人资料
        data = self.get("/v1/user/info", token=token)
        self.assertErrorEqual(data, BadTokenError)

    def test_info(self):
        """测试获取与修改用户资料"""
        token1 = self.create_user("11", "1@1.com", "111111").generate_token()
        token2 = self.create_user("22", "2@1.com", "111111").generate_token()
        # 获取他人资料
        data = self.get("/v1/users/11")
        self.assertErrorEqual(data)
        self.assertEqual(data.json["name"], "11")
        self.assertNotEqual(data.json["signature"], None)  # 签名不会为空
        # 获取他人资料
        data = self.get("/v1/users/22")
        self.assertErrorEqual(data)
        self.assertEqual(data.json["name"], "22")
        self.assertNotEqual(data.json["signature"], None)  # 签名不会为空
        # 获取个人资料
        data = self.get("/v1/user/info", token=token1)
        self.assertErrorEqual(data)
        self.assertEqual(data.json["name"], "11")
        # 获取个人资料
        data = self.get("/v1/user/info", token=token2)
        self.assertErrorEqual(data)
        self.assertEqual(data.json["name"], "22")
        # locale只能设置成可选值
        data = self.put(
            "/v1/user/info",
            json={"name": "11", "signature": "222", "locale": "balabala"},
            token=token1,
        )
        self.assertErrorEqual(data, ValidateError)
        # 仅修改签名
        data = self.put(
            "/v1/user/info",
            json={"name": "11", "signature": "222", "locale": Locale.AUTO},
            token=token1,
        )
        self.assertErrorEqual(data)
        # 获取个人资料进行对比
        data = self.get(
            "/v1/user/info",
            token=token1,
            headers={"Origin": "https://example.com", "Accept-Language": "en"},
        )
        self.assertErrorEqual(data)
        self.assertEqual(data.json["name"], "11")
        self.assertEqual(data.json["signature"], "222")
        self.assertEqual(
            data.json["locale"],
            {"id": "auto", "name": "Auto", "intro": "Follow browser settings."},
        )
        # 设置资料
        data = self.put(
            "/v1/user/info",
            json={"name": "111", "signature": "111", "locale": Locale.ZH_CN},
            token=token1,
        )
        self.assertErrorEqual(data)
        # 获取个人资料进行对比
        data = self.get(
            "/v1/user/info",
            token=token1,
            headers={"Origin": "https://example.com", "Accept-Language": "en"},
        )
        self.assertErrorEqual(data)
        self.assertEqual(data.json["name"], "111")
        self.assertEqual(data.json["signature"], "111")
        self.assertEqual(
            data.json["locale"], {"id": "zh_CN", "name": "Chinese (Simplified)", "intro": ""}
        )
        # 再次设置资料，将一些值设为空
        data = self.put(
            "/v1/user/info",
            json={"name": "111", "signature": "", "locale": Locale.ZH_CN},
            token=token1,
        )
        self.assertErrorEqual(data)
        # 获取个人资料进行对比
        data = self.get(
            "/v1/user/info",
            token=token1,
            headers={"Origin": "https://example.com", "Accept-Language": "en"},
        )
        self.assertErrorEqual(data)
        self.assertEqual(data.json["name"], "111")
        self.assertEqual(data.json["signature"], "")
        self.assertEqual(
            data.json["locale"], {"id": "zh_CN", "name": "Chinese (Simplified)", "intro": ""}
        )
        # 设置成已经存在的名称，出错
        data = self.put(
            "/v1/user/info",
            json={"name": "22", "signature": "", "locale": Locale.ZH_CN},
            token=token1,
        )
        self.assertErrorEqual(data, ValidateError)
        self.assertIsNotNone(data.json["message"].get("name"))
        # 设置成不合法的名称
        data = self.put(
            "/v1/user/info",
            json={"name": "2 2", "signature": "", "locale": Locale.ZH_CN},
            token=token1,
        )
        self.assertErrorEqual(data, ValidateError)
        self.assertIsNotNone(data.json["message"].get("name"))

    def test_change_password(self):
        """测试修改密码"""
        # 创建用户
        token = self.create_user("11", "1@1.com", "111111").generate_token()
        # 测试登录
        captcha_info, captcha = self.get_captcha()
        data = self.post(
            "/v1/user/token",
            json={
                "email": "1@1.com",
                "password": "111111",
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(data)
        self.assertIsNotNone(data.json.get("token"))
        # 需要登录后才能修改
        data = self.put(
            "/v1/user/password",
            json={"old_password": "000000", "new_password": "222222"},
        )
        self.assertErrorEqual(data, NeedTokenError)
        # 用错误的原密码
        data = self.put(
            "/v1/user/password",
            json={"old_password": "000000", "new_password": "222222"},
            token=token,
        )
        self.assertErrorEqual(data, ValidateError)
        self.assertIsNotNone(data.json["message"].get("old_password"))
        self.assertIsNone(data.json["message"].get("new_password"))
        # 用正确的原密码
        data = self.put(
            "/v1/user/password",
            json={"old_password": "111111", "new_password": "222222"},
            token=token,
        )
        self.assertErrorEqual(data)
        # 测试登录，只能用222222登录了
        captcha_info, captcha = self.get_captcha()
        data = self.post(
            "/v1/user/token",
            json={
                "email": "1@1.com",
                "password": "111111",
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        captcha_info, captcha = self.get_captcha()
        self.assertErrorEqual(data, ValidateError)
        data = self.post(
            "/v1/user/token",
            json={
                "email": "1@1.com",
                "password": "222222",
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(data)
        self.assertIsNotNone(data.json.get("token"))


    def test_change_email1(self):
        """测试修改邮箱"""
        # 创建用户
        token = self.create_user("11", "AAA@a.com", "111111").generate_token()
        token2 = self.create_user("22", "BBB@b.com", "111111").generate_token()
        # 测试登录
        captcha_info, captcha = self.get_captcha()
        data = self.post(
            "/v1/user/token",
            json={
                "email": "AAA@a.com",
                "password": "111111",
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(data)
        self.assertIsNotNone(data.json.get("token"))
        # 不登录修改邮箱
        data = self.put(
            "/v1/user/email",
            json={
                "old_email_v_code": "A21KLk",
                "new_email": "CCC@c.com",
                "new_email_v_code": "kK12YI",
            },
        )
        self.assertErrorEqual(data, NeedTokenError)
        # 错误的邮箱格式
        data = self.put(
            "/v1/user/email",
            json={
                "old_email_v_code": "A21KLk",
                "new_email": "2@1.1",
                "new_email_v_code": "kK12YI",
            },
            token=token,
        )
        self.assertErrorEqual(data, ValidateError)
        self.assertIsNotNone(data.json["message"].get("new_email"))
        # 和自己旧邮箱相同
        data = self.put(
            "/v1/user/email",
            json={
                "old_email_v_code": "A21KLk",
                "new_email": "AAA@a.com",
                "new_email_v_code": "kK12YI",
            },
            token=token,
        )
        self.assertErrorEqual(data, ValidateError)
        self.assertIsNotNone(data.json["message"].get("new_email"))
        # 使用已注册的邮箱
        data = self.put(
            "/v1/user/email",
            json={
                "old_email_v_code": "A21KLk",
                "new_email": "BBB@b.com",
                "new_email_v_code": "kK12YI",
            },
            token=token,
        )
        self.assertErrorEqual(data, ValidateError)
        self.assertIsNotNone(data.json["message"].get("new_email"))
        # 申请重置邮箱邮件验证码
        data = self.post("/v1/reset-email-codes", token=token)
        self.assertErrorEqual(data)
        content = VCode.objects(type=VCodeType.RESET_EMAIL, info="aaa@a.com").first()[
            "content"
        ]
        captcha_info, captcha = self.get_captcha()
        # 申请确认邮箱邮件验证码
        data = self.post(
            "/v1/confirm-email-codes",
            json={
                "email": "CCC@c.com",
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(data)
        content2 = VCode.objects(
            type=VCodeType.CONFIRM_EMAIL, info="ccc@c.com"
        ).first()["content"]
        # 使用错误的验证码
        data = self.put(
            "/v1/user/email",
            json={
                "old_email_v_code": "A21KLk.",
                "new_email": "CCC@c.com",
                "new_email_v_code": "kK12YI.",
            },
            token=token,
        )
        self.assertErrorEqual(data, ValidateError)
        self.assertIsNotNone(data.json["message"].get("old_email_v_code"))
        self.assertIsNotNone(data.json["message"].get("new_email_v_code"))
        # 使用错误的邮箱
        data = self.put(
            "/v1/user/email",
            json={
                "old_email_v_code": content,
                "new_email": "3@1.com",
                "new_email_v_code": content2,
            },
            token=token,
        )
        self.assertErrorEqual(data, ValidateError)
        self.assertIsNotNone(data.json["message"].get("new_email_v_code"))
        # 他人使用正确的验证码
        data = self.put(
            "/v1/user/email",
            json={
                "old_email_v_code": content,
                "new_email": "CCC@c.com",
                "new_email_v_code": content2,
            },
            token=token2,
        )
        self.assertErrorEqual(data, ValidateError)
        self.assertIsNotNone(data.json["message"].get("old_email_v_code"))
        # 正确的修改
        data = self.put(
            "/v1/user/email",
            json={
                "old_email_v_code": content,
                "new_email": "CCC@c.com",
                "new_email_v_code": content2,
            },
            token=token,
        )
        self.assertErrorEqual(data)
        # 测试登录，只能用CCC@c.com登录了
        captcha_info, captcha = self.get_captcha()
        data = self.post(
            "/v1/user/token",
            json={
                "email": "AAA@a.com",
                "password": "111111",
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        captcha_info, captcha = self.get_captcha()
        self.assertErrorEqual(data, ValidateError)
        data = self.post(
            "/v1/user/token",
            json={
                "email": "CCC@c.com",
                "password": "111111",
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(data)
        self.assertIsNotNone(data.json.get("token"))
        # 用户邮箱记录的是小写
        user = User.get_by_email("CCC@c.com")
        self.assertEqual(user.email, "ccc@c.com")

    def test_change_email2(self):
        """测试修改邮箱（申请重置邮箱邮件验证码使用大写）"""
        # 创建用户
        token = self.create_user("11", "AAA@a.com", "111111").generate_token()
        # 测试登录
        captcha_info, captcha = self.get_captcha()
        data = self.post(
            "/v1/user/token",
            json={
                "email": "AAA@a.com",
                "password": "111111",
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(data)
        self.assertIsNotNone(data.json.get("token"))
        # 申请重置邮箱邮件验证码
        data = self.post("/v1/reset-email-codes", token=token)
        self.assertErrorEqual(data)
        content = VCode.objects(type=VCodeType.RESET_EMAIL, info="aaa@a.com").first()[
            "content"
        ]
        captcha_info, captcha = self.get_captcha()
        # 申请确认邮箱邮件验证码
        data = self.post(
            "/v1/confirm-email-codes",
            json={
                "email": "CCC@c.com",
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(data)
        content2 = VCode.objects(
            type=VCodeType.CONFIRM_EMAIL, info="ccc@c.com"
        ).first()["content"]
        # 正确的修改
        data = self.put(
            "/v1/user/email",
            json={
                "old_email_v_code": content,
                "new_email": "ccc@c.com",
                "new_email_v_code": content2,
            },
            token=token,
        )
        self.assertErrorEqual(data)
        # 测试登录，只能用CCC@c.com登录了
        captcha_info, captcha = self.get_captcha()
        data = self.post(
            "/v1/user/token",
            json={
                "email": "AAA@a.com",
                "password": "111111",
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        captcha_info, captcha = self.get_captcha()
        self.assertErrorEqual(data, ValidateError)
        data = self.post(
            "/v1/user/token",
            json={
                "email": "CCC@c.com",
                "password": "111111",
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(data)
        self.assertIsNotNone(data.json.get("token"))
        # 用户邮箱记录的是小写
        user = User.get_by_email("CCC@c.com")
        self.assertEqual(user.email, "ccc@c.com")

    def test_change_email3(self):
        """测试修改邮箱（申请重置请求使用大写）"""
        # 创建用户
        token = self.create_user("11", "AAA@a.com", "111111").generate_token()
        # 测试登录
        captcha_info, captcha = self.get_captcha()
        data = self.post(
            "/v1/user/token",
            json={
                "email": "AAA@a.com",
                "password": "111111",
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(data)
        self.assertIsNotNone(data.json.get("token"))
        # 申请重置邮箱邮件验证码
        data = self.post("/v1/reset-email-codes", token=token)
        self.assertErrorEqual(data)
        content = VCode.objects(type=VCodeType.RESET_EMAIL, info="aaa@a.com").first()[
            "content"
        ]
        captcha_info, captcha = self.get_captcha()
        # 申请确认邮箱邮件验证码
        data = self.post(
            "/v1/confirm-email-codes",
            json={
                "email": "ccc@c.com",
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(data)
        content2 = VCode.objects(
            type=VCodeType.CONFIRM_EMAIL, info="ccc@c.com"
        ).first()["content"]
        # 正确的修改
        data = self.put(
            "/v1/user/email",
            json={
                "old_email_v_code": content,
                "new_email": "CCC@c.com",
                "new_email_v_code": content2,
            },
            token=token,
        )
        self.assertErrorEqual(data)
        # 测试登录，只能用CCC@c.com登录了
        captcha_info, captcha = self.get_captcha()
        data = self.post(
            "/v1/user/token",
            json={
                "email": "AAA@a.com",
                "password": "111111",
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        captcha_info, captcha = self.get_captcha()
        self.assertErrorEqual(data, ValidateError)
        data = self.post(
            "/v1/user/token",
            json={
                "email": "CCC@c.com",
                "password": "111111",
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(data)
        self.assertIsNotNone(data.json.get("token"))
        # 用户邮箱记录的是小写
        user = User.get_by_email("CCC@c.com")
        self.assertEqual(user.email, "ccc@c.com")

    def test_repetition(self):
        """测试重复用户名/邮箱"""
        email = "1@1.com"
        name = "11"
        password = "123123"
        self.create_user(name, email, password).generate_token()
        # == 正确的注册一个账号 ==
        # 申请人机验证码
        captcha_info, captcha = self.get_captcha()
        # 申请邮件验证码，直接报错，邮箱已注册
        v2 = self.post(
            "/v1/confirm-email-codes",
            json={
                "email": email,
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(v2, ValidateError)
        self.assertIn("email", v2.json["message"])
        # 也报错邮箱已注册
        data = self.post(
            "/v1/users",
            json={
                "email": email,
                "name": name,
                "password": password,
                "v_code": "123",
            },
        )
        self.assertErrorEqual(data, ValidateError)
        self.assertIn("email", data.json["message"])
        self.assertIn("name", data.json["message"])

    def test_repetition_capital1(self):
        """测试重复用户名/邮箱(大小写)"""
        email = "A@A.com"
        name = "aa"
        password = "123123"
        self.create_user(name, email, password).generate_token()
        # == 正确的注册一个账号 ==
        # 申请人机验证码
        captcha_info, captcha = self.get_captcha()
        # 申请邮件验证码，直接报错，邮箱已注册
        v2 = self.post(
            "/v1/confirm-email-codes",
            json={
                "email": email.upper(),
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(v2, ValidateError)
        self.assertIn("email", v2.json["message"])
        # 也报错邮箱已注册
        data = self.post(
            "/v1/users",
            json={
                "email": email.upper(),
                "name": name,
                "password": password,
                "v_code": "123",
            },
        )
        self.assertErrorEqual(data, ValidateError)
        self.assertIn("email", data.json["message"])
        self.assertIn("name", data.json["message"])

    def test_repetition_capital2(self):
        """测试重复用户名/邮箱(大小写)"""
        email = "A@A.com"
        name = "aa"
        password = "123123"
        self.create_user(name, email, password).generate_token()
        # == 正确的注册一个账号 ==
        # 申请人机验证码
        captcha_info, captcha = self.get_captcha()
        # 申请邮件验证码，直接报错，邮箱已注册
        v2 = self.post(
            "/v1/confirm-email-codes",
            json={
                "email": email.lower(),
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(v2, ValidateError)
        self.assertIn("email", v2.json["message"])
        # 也报错邮箱已注册
        data = self.post(
            "/v1/users",
            json={
                "email": email.lower(),
                "name": name,
                "password": password,
                "v_code": "123",
            },
        )
        self.assertErrorEqual(data, ValidateError)
        self.assertIn("email", data.json["message"])
        self.assertIn("name", data.json["message"])

    def test_repetition_capital3(self):
        """测试重复用户名/邮箱(大小写)"""
        email = "a@a.com"
        name = "aa"
        password = "123123"
        self.create_user(name, email, password).generate_token()
        # == 正确的注册一个账号 ==
        # 申请人机验证码
        captcha_info, captcha = self.get_captcha()
        # 申请邮件验证码，直接报错，邮箱已注册
        v2 = self.post(
            "/v1/confirm-email-codes",
            json={
                "email": email.upper(),
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(v2, ValidateError)
        self.assertIn("email", v2.json["message"])
        # 也报错邮箱已注册
        data = self.post(
            "/v1/users",
            json={
                "email": email.upper(),
                "name": name,
                "password": password,
                "v_code": "123",
            },
        )
        self.assertErrorEqual(data, ValidateError)
        self.assertIn("email", data.json["message"])
        self.assertIn("name", data.json["message"])

    def test_banned(self):
        """测试用户被封禁"""
        token = self.create_user("11", "1@1.com", "123123").generate_token()
        user = User.objects(email="1@1.com").first()
        user.banned = True
        user.save()
        # 尝试访问需要登录的接口，报错
        data = self.get("/v1/user/info", token=token)
        self.assertErrorEqual(data, UserBannedError)


    def test_admin_register(self):
        """测试管理后台注册API"""
        test_default_users_count = DEFAULT_USERS_COUNT + 2
        admin_user = self.create_user("admin")
        admin_user.admin = True
        admin_user.save()
        admin_token = admin_user.generate_token()
        user = self.create_user("user")
        user_token = user.generate_token()
        self.assertEqual(User.objects.count(), test_default_users_count + 0)
        # == 非管理员无法注册 ==
        data = self.post(
            "/v1/admin/users",
            json={
                "email": "AAA@a.com",
                "name": "12134",
                "password": "111111",
            },
            token=user_token,
        )
        self.assertErrorEqual(data, NoPermissionError)
        self.assertEqual(User.objects.count(), test_default_users_count + 0)
        # == 正确的注册 ==
        data = self.post(
            "/v1/admin/users",
            json={
                "email": "AAA@a.com",
                "name": "12134",
                "password": "111111",
            },
            token=admin_token,
        )
        self.assertErrorEqual(data)
        self.assertEqual(User.objects.count(), test_default_users_count + 1)
        # == 注册过的邮箱不能再次注册 ==
        data = self.post(
            "/v1/admin/users",
            json={
                "email": "AAA@a.com",
                "name": "12134a",
                "password": "111111",
            },
            token=admin_token,
        )
        self.assertErrorEqual(data, ValidateError)
        self.assertEqual(User.objects.count(), test_default_users_count + 1)
        # == 注册过的昵称不能再次注册 ==
        data = self.post(
            "/v1/admin/users",
            json={
                "email": "AAA1@a.com",
                "name": "12134",
                "password": "111111",
            },
            token=admin_token,
        )
        self.assertErrorEqual(data, ValidateError)
        self.assertEqual(User.objects.count(), test_default_users_count + 1)
        # 用户邮箱记录的是小写
        user = User.get_by_email("AAA@a.com")
        self.assertEqual(user.email, "aaa@a.com")

    def test_admin_edit_user_password(self):
        """测试管理后台修改用户密码"""
        admin_user = self.create_user("admin")
        admin_user.admin = True
        admin_user.save()
        admin_token = admin_user.generate_token()
        user = self.create_user("user")
        user_token = user.generate_token()
        new_password = "new_password111111"
        # == 非管理员无法修改 ==
        data = self.put(
            "/v1/admin/users/" + str(user.id),
            json={
                "password": new_password,
            },
            token=user_token,
        )
        self.assertErrorEqual(data, NoPermissionError)
        # 使用新密码无法登陆
        captcha_info, captcha = self.get_captcha()
        data = self.post(
            "/v1/user/token",
            json={
                "email": user.email,
                "password": new_password,
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(data, ValidateError)
        self.assertIsNotNone(data.json.get("message").get("password"))
        # == 管理员可以修改 ==
        data = self.put(
            "/v1/admin/users/" + str(user.id),
            json={
                "password": new_password,
            },
            token=admin_token,
        )
        self.assertErrorEqual(data)
        # 使用新密码可以登陆
        captcha_info, captcha = self.get_captcha()
        data = self.post(
            "/v1/user/token",
            json={
                "email": user.email,
                "password": new_password,
                "captcha_info": captcha_info,
                "captcha": captcha,
            },
        )
        self.assertErrorEqual(data)
        self.assertIsNotNone(data.json.get("token"))

    def test_auto_join_team_when_register(self):
        """测试注册时自动加入团队"""
        site_setting = SiteSetting.get()
        # 创建团队
        team_admin_role = TeamRole.by_system_code("admin")
        team_beginner_role = TeamRole.by_system_code("beginner")
        # team1 默认角色为 beginner, team2 默认角色为 admin
        team1 = self.create_team("team1")
        team2 = self.create_team("team2")
        team2.default_role = team_admin_role
        team2.save()
        site_setting.auto_join_team_ids = [
            team1.id,
            team2.id,
            ObjectId(),
        ]  # 第三个为不存在的团队
        site_setting.save()
        site_setting.reload()
        # 注册
        user = self.create_user("user1")
        teams = user.teams()
        self.assertEqual(teams.count(), 2)
        self.assertListEqual([team.id for team in teams], [team1.id, team2.id])
        self.assertEqual(user.teams(role=team_beginner_role).first().id, team1.id)
        self.assertEqual(user.teams(role=team_admin_role).first().id, team2.id)
