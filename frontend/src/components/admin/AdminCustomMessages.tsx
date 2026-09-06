import { css } from '@emotion/core';
import { Button, Collapse, message, Spin } from 'antd';
import TextArea from 'antd/lib/input/TextArea';
import classNames from 'classnames';
import React, { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { api } from '@/apis';
import { FC } from '@/interfaces';
import {
  CUSTOM_MESSAGE_DEFS,
  CUSTOM_MESSAGE_GROUPS,
  CustomMessageDef,
} from '@/locales/custom-messages';
import style from '@/style';

const { Panel } = Collapse;
const GROUP_ORDER = ['brand'];

/** 语言分区 key（与前端 matchLocale 返回值一致） */
const LOCALE_ZH = 'zh-CN';
const LOCALE_EN = 'en';

/** 每个文案项：{ zh: 简体中文值, en: 英文值 } */
interface MessageValues {
  zh: string;
  en: string;
}

/** 自定义文案覆盖管理的属性接口 */
interface AdminCustomMessagesProps {
  className?: string;
}

/**
 * 自定义文案覆盖：将 irohamod 相对官方改过的文案 key 做成可编辑项，
 * 管理员可运行时改文案值（保存后刷新即全局生效，无需改代码）。
 * 支持按语言（简体中文/English）分别覆盖；空值表示恢复默认。
 */
export const AdminCustomMessages: FC<AdminCustomMessagesProps> = ({
  className,
}) => {
  const { formatMessage } = useIntl();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<string, MessageValues>>({});

  useEffect(() => {
    api.siteSetting
      .getCustomMessages({})
      .then((result) => {
        const data = result.data || {};
        const parsed: Record<string, MessageValues> = {};
        for (const def of CUSTOM_MESSAGE_DEFS) {
          const zh =
            typeof data[LOCALE_ZH] === 'object' && data[LOCALE_ZH] !== null
              ? String(data[LOCALE_ZH][def.key] ?? '')
              : String(data[def.key] ?? ''); // 兼容旧扁平结构 { key: msg }
          const en =
            typeof data[LOCALE_EN] === 'object' && data[LOCALE_EN] !== null
              ? String(data[LOCALE_EN][def.key] ?? '')
              : '';
          parsed[def.key] = { zh, en };
        }
        setValues(parsed);
      })
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, CustomMessageDef[]>();
    for (const def of CUSTOM_MESSAGE_DEFS) {
      const list = map.get(def.group) || [];
      list.push(def);
      map.set(def.group, list);
    }
    return map;
  }, []);

  const onChange = (key: string, lang: 'zh' | 'en', value: string) => {
    setValues((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || { zh: '', en: '' }), [lang]: value },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 按语言分组提交：{ "zh-CN": {key: msg}, "en": {key: msg} }；空字符串表示恢复默认
      const messages: Record<string, Record<string, string>> = {
        [LOCALE_ZH]: {},
        [LOCALE_EN]: {},
      };
      for (const def of CUSTOM_MESSAGE_DEFS) {
        const v = values[def.key] || { zh: '', en: '' };
        const zh = v.zh.trim();
        const en = v.en.trim();
        if (zh !== '' && zh !== def.default) {
          messages[LOCALE_ZH][def.key] = zh;
        }
        if (en !== '' && en !== def.defaultEn) {
          messages[LOCALE_EN][def.key] = en;
        }
      }
      await api.siteSetting.saveCustomMessages({ messages });
      message.success(formatMessage({ id: 'admin.customMsgSaved' }));
      location.reload();
    } catch (error) {
      error.default();
      setSaving(false);
    }
  };

  return loading ? (
    <Spin />
  ) : (
    <div className={classNames('AdminCustomMessages', className)} css={css``}>
      <Collapse
        accordion={false}
        defaultActiveKey={GROUP_ORDER}
        bordered={false}
        css={css`
          .ant-collapse-content-box {
            padding: 0 !important;
          }
        `}
      >
        {GROUP_ORDER.filter((group) => grouped.has(group)).map((group) => (
          <Panel
            key={group}
            header={
              <span css={css`font-weight: 600;`}>
                {formatMessage({ id: CUSTOM_MESSAGE_GROUPS[group] })}
              </span>
            }
          >
            <div css={css`padding: 0 16px 12px;`}>
              {grouped.get(group)!.map((def) => (
                <div
                  key={def.key}
                  css={css`
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    padding: 12px 8px;
                    border-bottom: 1px solid ${style.borderColorLight};
                    &:last-child {
                      border-bottom: 0;
                    }
                  `}
                >
                  <code
                    css={css`
                      font-size: 12px;
                      color: ${style.textColorSecondary};
                    `}
                  >
                    {def.key}
                  </code>
                  {(
                    [
                      ['zh', LOCALE_ZH, def.default],
                      ['en', LOCALE_EN, def.defaultEn],
                    ] as const
                  ).map(([lang, localeLabel, defaultValue]) => (
                    <div
                      key={lang}
                      css={css`
                        display: flex;
                        flex-direction: column;
                        gap: 2px;
                      `}
                    >
                      <span
                        css={css`
                          font-size: 12px;
                          color: ${style.textColorSecondary};
                        `}
                      >
                        {formatMessage({
                          id: lang === 'zh' ? 'admin.customMsgZh' : 'admin.customMsgEn',
                        })}
                        {' · '}
                        {formatMessage({ id: 'admin.customMsgDefault' })}: {defaultValue}
                      </span>
                      <TextArea
                        value={values[def.key]?.[lang] || ''}
                        rows={2}
                        placeholder={formatMessage({ id: 'admin.customMsgPlaceholder' })}
                        onChange={(event) => onChange(def.key, lang, event.target.value)}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </Collapse>
      <div css={css`margin-top: 20px; text-align: right;`}>
        <Button type="primary" onClick={handleSave} loading={saving}>
          {formatMessage({ id: 'form.submit' })}
        </Button>
      </div>
    </div>
  );
};

export default AdminCustomMessages;
