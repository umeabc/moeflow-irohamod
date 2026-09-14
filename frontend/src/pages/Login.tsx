import { css } from '@emotion/core';
import {
  Button,
  Input,
  Modal,
  Switch,
  Form as AntdForm,
  InputRef,
} from 'antd';
import React, { useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';
import { FailureResults, resultTypes, api } from '../apis';
import { Avatar, CAPTCHAInput, EmailInput, FormItem, Form } from '../components';
import {
  CAPTCHAInputRef,
  checkCAPTCHA,
} from '../components/shared-form/CAPTCHAInput';
import { AppState } from '../store';
import { setUserToken } from '../store/user/slice';
import { useTitle } from '../hooks';
import { FC } from '../interfaces';
import { EMAIL_REGEX, USER_NAME_REGEX } from '../utils/regex';
import defaultMascot from '@/images/brand/mascot-jump1.png';
import { useBrandMascot } from '@/hooks';
import style from '@/style';

/** 登录页的属性接口 */
interface LoginProps {
  beforeRedirect?: boolean;
}

// 品牌配色（彩翻粉 + 金色点缀）
const BRAND = {
  primary: style.primaryColor, // #FF657C
  primaryDeep: '#e0506a',
  gold: '#f2b64b',
  paper: '#fdf4f6', // 浅粉底
  cloud: '#ffffff',
  ink: '#3d3a3a',
  inkLight: '#8a8585',
  inkLighter: '#b8b2b2',
};

type AuthMode = 'login' | 'register';

/**
 * 登录页（参照 image-translator 登录页布局：左品牌区 + 右登录/注册分段卡片）
 */
const Login: FC<LoginProps> = ({ beforeRedirect = false } = {}) => {
  const { formatMessage } = useIntl(); // i18n
  useTitle({ prefix: formatMessage({ id: 'auth.login' }) }); // 设置标题
  const history = useHistory();
  const dispatch = useDispatch();
  const [form] = AntdForm.useForm();
  const [mode, setMode] = useState<AuthMode>('login');
  const captchaInputRef = useRef<CAPTCHAInputRef>(null);
  const customMascot = useBrandMascot();
  const mascot = customMascot || defaultMascot;

  // 已登录状态（token 来自 Cookie，应用启动时写入 Store）
  const currentUser = useSelector((state: AppState) => state.user);
  const isLogined = !!currentUser.token;

  // 用于密码错误，自动定位到密码输入框（因为密码错误刷新人机验证码，会错误 focus 到人机验证码输入框）
  const passwordInputRef = useRef<InputRef>(null);

  /** 切换 登录/注册 分段 */
  const switchMode = (next: AuthMode) => {
    if (next === mode) return;
    setMode(next);
    form.resetFields();
    // 刷新验证码（切换模式后旧验证码失效）
    captchaInputRef.current?.refresh({ focus: false });
  };

  /** 登录提交 */
  const handleLoginFinish = (values: any) => {
    api.auth
      .login({
        data: {
          email: values.email,
          password: values.password,
          captcha: values.captcha.value,
          captchaInfo: values.captcha.info,
        },
      })
      .then((result) => {
        // 重置表单
        form.resetFields();
        // 记录 token 到 Store 中
        dispatch(
          setUserToken({
            token: result.data.token,
            rememberMe: values.rememberMe,
          }),
        );
        // 跳转到仪表盘
        history.push('/dashboard/projects');
      })
      .catch((result: FailureResults) => {
        if (result.type === resultTypes.VALIDATION_FAILURE) {
          result.default(form);
          if (result.data.message.captcha) {
            // 如果是验证码错误，则刷新验证码
            captchaInputRef.current?.refresh({
              onFinish: () => {
                form.setFields([
                  {
                    name: 'captcha',
                    errors: result.data.message.captcha,
                  },
                ]); // 保持错误提示
              },
            });
          } else if (result.data.message.password) {
            // 如果是密码错误，则刷新人机验证码（人机验证码被使用所以失效了）
            form.setFields([{ name: 'password', value: '' }]); // 清空密码
            captchaInputRef.current?.refresh({ focus: false });
            passwordInputRef.current?.focus();
          }
          return;
        }
        result.default();
      });
  };

  /** 注册提交（复用 Register 页逻辑：需邀请码） */
  const handleRegisterFinish = (values: any) => {
    api.auth
      .register({ data: values })
      .then((result) => {
        // 重置表单
        form.resetFields();
        // 询问用户是否记住我
        Modal.confirm({
          title: formatMessage({ id: 'auth.registerSuccessTitle' }),
          content: formatMessage({ id: 'auth.autoLoginTip' }),
          okText: formatMessage({ id: 'auth.rememberMe' }),
          okType: 'primary',
          cancelText: formatMessage({ id: 'form.cancel' }),
          onOk: () => {
            dispatch(
              setUserToken({
                token: (result.data as { token: string }).token,
                rememberMe: true,
              }),
            );
            // 跳转到仪表盘
            history.push('/dashboard/projects');
          },
          onCancel: () => {
            dispatch(
              setUserToken({ token: (result.data as { token: string }).token }),
            );
            // 跳转到仪表盘
            history.push('/dashboard/projects');
          },
        });
      })
      .catch((result: FailureResults) => {
        if (result.type === resultTypes.VALIDATION_FAILURE) {
          // 字段验证错误
          result.default(form);
          return;
        }
        result.default();
      });
  };

  /** 提交表单（按模式分发） */
  const handleFinish = (values: any) => {
    if (mode === 'login') {
      handleLoginFinish(values);
    } else {
      handleRegisterFinish(values);
    }
  };

  /**
   * 前往重置密码页面
   */
  const toResetPassword = () => {
    history.push('/reset-password');
  };

  /** 前往仪表盘 */
  const goDashboard = () => {
    history.push('/dashboard/projects');
  };

  /** 登出（清空 token → saga 会移除 Cookie） */
  const logout = () => {
    dispatch(setUserToken({ token: '' }));
  };

  return (
    <div
      css={css`
        min-height: 100vh;
        display: flex;
        align-items: stretch;
        background: linear-gradient(
          135deg,
          ${BRAND.paper} 0%,
          #fff 55%,
          #fff7f0 100%
        );
        overflow: hidden;

        /* ===== 左：品牌区 ===== */
        .Login__Brand {
          position: relative;
          flex: 1.1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 32px;
          text-align: center;
          @media (max-width: 900px) {
            display: none; /* 小屏隐藏品牌区 */
          }

          /* 光环（呼吸动画） */
          .Login__Halo {
            position: absolute;
            left: 50%;
            top: 42%;
            width: 400px;
            height: 400px;
            transform: translate(-50%, -50%);
            pointer-events: none;
            .Login__HaloRing {
              position: absolute;
              inset: 0;
              border-radius: 50%;
              border: 2px solid rgba(255, 101, 124, 0.35);
              box-shadow: 0 0 0 22px rgba(255, 101, 124, 0.08),
                0 0 0 44px rgba(242, 182, 75, 0.06);
              animation: loginHaloBreathe 4.5s ease-in-out infinite;
            }
            .Login__HaloRing2 {
              position: absolute;
              inset: 26px;
              border-radius: 50%;
              border: 1px solid rgba(242, 182, 75, 0.35);
            }
          }

          .Login__Mascot {
            position: relative;
            width: auto;
            height: min(46vh, 380px);
            object-fit: contain;
            filter: drop-shadow(0 16px 34px rgba(255, 101, 124, 0.24));
            animation: loginMascotFloat 5.5s ease-in-out infinite;
          }

          .Login__BrandTitle {
            position: relative;
            margin-top: 28px;
            font-size: 42px;
            font-weight: 700;
            letter-spacing: 6px;
            color: ${BRAND.primaryDeep};
          }
          .Login__BrandSlogan {
            position: relative;
            margin-top: 14px;
            max-width: 380px;
            font-size: 15px;
            line-height: 1.8;
            color: ${BRAND.inkLight};
            letter-spacing: 2px;
          }
        }

        /* ===== 右：认证卡片 ===== */
        .Login__Panel {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
        }

        .Login__Card {
          position: relative;
          width: 100%;
          max-width: 440px;
          background: ${BRAND.cloud};
          border: 1px solid rgba(255, 101, 124, 0.14);
          border-radius: 20px;
          box-shadow: 0 24px 64px rgba(255, 101, 124, 0.14),
            0 2px 8px rgba(0, 0, 0, 0.04);
          overflow: hidden;
          padding: 36px 36px 30px;

          /* 顶部斜条纹（参照 image-translator momentum-stripes） */
          &::before {
            content: '';
            position: absolute;
            inset: 0 0 auto 0;
            height: 5px;
            background: repeating-linear-gradient(
              -55deg,
              rgba(255, 101, 124, 0.55) 0 7px,
              rgba(255, 101, 124, 0) 7px 14px,
              rgba(242, 182, 75, 0.6) 14px 19px,
              rgba(242, 182, 75, 0) 19px 26px
            );
            pointer-events: none;
          }

          .Login__Seg {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px;
            padding: 4px;
            margin-bottom: 26px;
            border-radius: 12px;
            background: ${BRAND.paper};
            border: 1px solid rgba(255, 101, 124, 0.14);
          }
          .Login__SegBtn {
            border: none;
            background: transparent;
            border-radius: 9px;
            padding: 9px 0;
            font-size: 15px;
            font-weight: 600;
            color: ${BRAND.inkLighter};
            cursor: pointer;
            transition: all 0.25s ease;
            &.on {
              background: ${BRAND.cloud};
              color: ${BRAND.primaryDeep};
              box-shadow: 0 2px 8px rgba(255, 101, 124, 0.18);
            }
            &:hover:not(.on) {
              color: ${BRAND.inkLight};
            }
          }

          .Login__CardTitle {
            font-size: 26px;
            font-weight: 700;
            color: ${BRAND.ink};
            margin-bottom: 4px;
          }
          .Login__CardSub {
            font-size: 14px;
            color: ${BRAND.inkLight};
            margin-bottom: 26px;
          }

          .Login__SubmitFormItem {
            margin-bottom: 16.5px;
          }
          .Login__ToResetPassword {
            text-align: center;
            width: 100%;
            margin-top: 4px;
            .ant-btn {
              font-size: 14px;
              color: ${BRAND.inkLighter};
            }
          }
          .Login__RememberRow {
            display: flex;
            align-items: center;
            justify-content: center;
            color: ${BRAND.inkLight};
            font-size: 14px;
            .label {
              margin-right: 10px;
            }
          }
          .Login__Hint {
            font-size: 12px;
            color: ${BRAND.inkLighter};
            text-align: center;
            margin-top: 12px;
          }

          /* 已登录提示 */
          .Login__Logined {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            padding: 18px 0 8px;
            .Login__LoginedAvatar {
              margin-bottom: 22px;
            }
            .Login__LoginedTip {
              color: ${BRAND.inkLight};
              font-size: 18px;
              margin-bottom: 28px;
              .Login__LoginedName {
                color: ${BRAND.primaryDeep};
                font-weight: 600;
              }
            }
            .Login__LoginedBtn {
              height: 42px;
              border-radius: 10px;
              font-size: 15px;
              margin-bottom: 14px;
              &.Login__LoginedPrimary {
                background: linear-gradient(
                  135deg,
                  ${BRAND.primary},
                  ${BRAND.primaryDeep}
                );
                border: none;
                box-shadow: 0 8px 20px rgba(255, 101, 124, 0.3);
                transition: all 0.25s ease;
                &:hover {
                  background: linear-gradient(
                    135deg,
                    ${BRAND.primaryDeep},
                    ${BRAND.primaryDeep}
                  );
                  transform: translateY(-1px);
                }
              }
            }
          }
        }

        /* 入场动画 */
        .Login__FadeIn {
          animation: loginFadeUp 0.7s ease both;
        }
        .Login__FadeInDelay1 {
          animation: loginFadeUp 0.7s ease 0.15s both;
        }

        @keyframes loginHaloBreathe {
          0%,
          100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.06);
            opacity: 0.85;
          }
        }
        @keyframes loginMascotFloat {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        @keyframes loginFadeUp {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}
    >
      {/* 左：品牌区 */}
      <div className="Login__Brand">
        <div className="Login__Halo">
          <div className="Login__HaloRing" />
          <div className="Login__HaloRing2" />
        </div>
        <img className="Login__Mascot" src={mascot} alt="mascot" />
        <div className="Login__BrandTitle Login__FadeInDelay1">
          {formatMessage({ id: 'site.name' })}
        </div>
        <div className="Login__BrandSlogan Login__FadeInDelay1">
          {formatMessage({ id: 'site.slogan' })}
        </div>
      </div>

      {/* 右：认证卡片 */}
      <div className="Login__Panel">
        <div className="Login__Card Login__FadeIn">
          {/* 已登录：显示提示，不再显示登录/注册表单 */}
          {isLogined ? (
            <div className="Login__Logined">
              <Avatar
                type="user"
                className="Login__LoginedAvatar"
                size={104}
                url={currentUser.avatar}
              />
              <div className="Login__LoginedTip">
                {formatMessage({ id: 'auth.loginedTip' }, { userName: currentUser.name })}
              </div>
              <Button
                onClick={goDashboard}
                className="Login__LoginedBtn Login__LoginedPrimary"
                size="large"
                type="primary"
                block
              >
                {formatMessage({ id: 'router.goDashboard' })}
              </Button>
              <Button
                onClick={logout}
                className="Login__LoginedBtn"
                size="large"
                block
              >
                {formatMessage({ id: 'auth.logout' })}
              </Button>
            </div>
          ) : (
            <>
          {/* 登录/注册分段切换 */}
          <div className="Login__Seg">
            <button
              type="button"
              className={`Login__SegBtn ${mode === 'login' ? 'on' : ''}`}
              onClick={() => switchMode('login')}
            >
              {formatMessage({ id: 'auth.login' })}
            </button>
            <button
              type="button"
              className={`Login__SegBtn ${mode === 'register' ? 'on' : ''}`}
              onClick={() => switchMode('register')}
            >
              {formatMessage({ id: 'auth.register' })}
            </button>
          </div>

          <div className="Login__CardTitle">
            {mode === 'login'
              ? beforeRedirect
                ? formatMessage({ id: 'auth.loginFirst' })
                : formatMessage({ id: 'auth.login' })
              : formatMessage({ id: 'auth.register' })}
          </div>
          <div className="Login__CardSub">
            {mode === 'login'
              ? formatMessage({ id: 'auth.loginTip' })
              : formatMessage({ id: 'auth.registerTip' })}
          </div>

          <Form
            name="auth-form"
            form={form}
            onFinish={handleFinish}
            initialValues={{
              rememberMe: false,
            }}
          >
            {/* 登录模式字段 */}
            {mode === 'login' && (
              <>
                <FormItem
                  name="email"
                  rules={[
                    { required: true },
                    {
                      pattern: EMAIL_REGEX,
                      message: formatMessage({ id: 'form.formatWrong' }),
                    },
                  ]}
                >
                  <EmailInput
                    prefix={formatMessage({ id: 'site.email' })}
                    size={'large'}
                  />
                </FormItem>
                <FormItem
                  name="password"
                  rules={[{ required: true }, { min: 6 }, { max: 60 }]}
                >
                  <Input.Password
                    prefix={formatMessage({ id: 'site.password' })}
                    size="large"
                    ref={passwordInputRef}
                  />
                </FormItem>
                <FormItem name="captcha" rules={[{ validator: checkCAPTCHA }]}>
                  <CAPTCHAInput ref={captchaInputRef} />
                </FormItem>
                <FormItem
                  css={css`
                    .ant-form-item-control-input-content {
                      display: flex;
                      justify-content: center;
                      align-items: center;
                    }
                  `}
                >
                  <div className="Login__RememberRow">
                    <div className="label">
                      {formatMessage({ id: 'auth.rememberMe' })}
                    </div>
                    <FormItem name="rememberMe" valuePropName="checked" noStyle>
                      <Switch size="small" />
                    </FormItem>
                  </div>
                </FormItem>
              </>
            )}

            {/* 注册模式字段（复用 Register 页：需邀请码） */}
            {mode === 'register' && (
              <>
                <FormItem
                  name="email"
                  rules={[
                    { required: true },
                    {
                      type: 'email',
                      message: formatMessage({ id: 'auth.emailFormatTip' }),
                    },
                  ]}
                >
                  <Input
                    prefix={formatMessage({ id: 'site.email' })}
                    size="large"
                  />
                </FormItem>
                <FormItem name="inviteCode" rules={[{ required: true }]}>
                  <Input
                    prefix={formatMessage({ id: 'register.inviteCode' })}
                    size="large"
                  />
                </FormItem>
                <FormItem
                  name="name"
                  rules={[
                    { required: true },
                    {
                      pattern: USER_NAME_REGEX,
                      message: formatMessage({ id: 'auth.userNameFormatTip' }),
                    },
                    { min: 2 },
                    { max: 18 },
                  ]}
                >
                  <Input
                    prefix={formatMessage({ id: 'site.userName' })}
                    size="large"
                  />
                </FormItem>
                <FormItem
                  name="password"
                  rules={[{ required: true }, { min: 6 }, { max: 60 }]}
                >
                  <Input.Password
                    prefix={formatMessage({ id: 'site.password' })}
                    size="large"
                  />
                </FormItem>
              </>
            )}

            <FormItem className="Login__SubmitFormItem">
              <Button
                type="primary"
                size="large"
                block
                htmlType="submit"
                css={css`
                  height: 44px;
                  border-radius: 10px;
                  font-size: 16px;
                  background: linear-gradient(
                    135deg,
                    ${BRAND.primary},
                    ${BRAND.primaryDeep}
                  );
                  border: none;
                  box-shadow: 0 8px 20px rgba(255, 101, 124, 0.3);
                  transition: all 0.25s ease;
                  &:hover {
                    background: linear-gradient(
                      135deg,
                      ${BRAND.primaryDeep},
                      ${BRAND.primaryDeep}
                    );
                    transform: translateY(-1px);
                    box-shadow: 0 10px 24px rgba(255, 101, 124, 0.36);
                  }
                `}
              >
                {mode === 'login'
                  ? formatMessage({ id: 'auth.login' })
                  : formatMessage({ id: 'auth.registerAndLogin' })}
              </Button>
            </FormItem>
            {mode === 'login' && (
              <div className="Login__ToResetPassword">
                <Button type="link" onClick={toResetPassword}>
                  {formatMessage({ id: 'auth.toResetPasswordTip' })}
                </Button>
              </div>
            )}
            {mode === 'register' && (
              <div className="Login__Hint">
                {formatMessage({ id: 'register.inviteTip' })}
              </div>
            )}
          </Form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
export default Login;
