import { css } from '@emotion/core';
import { Button, Form as AntdForm, message, Spin, Switch, Upload } from 'antd';
import TextArea from 'antd/lib/input/TextArea';
import classNames from 'classnames';
import React, { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { api } from '@/apis';
import {
  APIBrandAssets,
  APISiteSetting,
  BrandAssetType,
} from '@/apis/siteSetting';
import { FC } from '@/interfaces';
import { toLowerCamelCase } from '@/utils';
import { Form } from '@/components/shared-form/Form';
import { FormItem } from '@/components/shared-form/FormItem';
import style from '@/style';
import { BRAND_TEXT_KEYS } from '@/locales/custom-messages';

/** 语言分区 key（与前端 matchLocale 返回值一致） */
const LOCALE_ZH = 'zh-CN';
const LOCALE_EN = 'en';

/** 品牌文案项的属性：中/英文值 */
interface BrandTextDef {
  key: string;
  zh: string;
  en: string;
  labelId: string;
}

function textareaToArray(textarea: string): string[] {
  return textarea.trim() === ''
    ? []
    : Array.from(
        new Set(
          textarea
            .split('\n')
            .map((item) => item.trim())
            .filter((item) => item !== ''),
        ),
      );
}

function arrayToTextarea(array: string[]): string {
  return array.join('\n');
}

/** 站点设置的属性接口 */
interface AdminSiteSettingProps {
  className?: string;
}
/**
 * 站点设置
 */
export const AdminSiteSetting: FC<AdminSiteSettingProps> = ({ className }) => {
  const { formatMessage } = useIntl();

  const [form] = AntdForm.useForm();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [siteSetting, setSiteSetting] = useState<APISiteSetting | null>(null);
  const [brandAssets, setBrandAssets] = useState<APIBrandAssets | null>(null);
  const [uploading, setUploading] = useState<BrandAssetType | null>(null);
  const [brandTexts, setBrandTexts] = useState<BrandTextDef[]>([]);
  const [brandTextSaving, setBrandTextSaving] = useState(false);

  const refreshBrandAssets = () => {
    api.siteSetting
      .getBrandAssets({})
      .then((result) => setBrandAssets(result.data))
      .catch(() => setBrandAssets(null));
  };

  const brandTextMeta: { key: string; labelId: string }[] = [
    { key: 'site.name', labelId: 'admin.brandTextSiteName' },
    { key: 'site.slogan', labelId: 'admin.brandTextSlogan' },
    { key: 'site.englishName', labelId: 'admin.brandTextEnglishName' },
  ];

  const refreshBrandTexts = () => {
    api.siteSetting
      .getCustomMessages({})
      .then((result) => {
        const data = result.data || {};
        const zhMap =
          typeof data[LOCALE_ZH] === 'object' && data[LOCALE_ZH] !== null
            ? data[LOCALE_ZH]
            : {};
        const enMap =
          typeof data[LOCALE_EN] === 'object' && data[LOCALE_EN] !== null
            ? data[LOCALE_EN]
            : {};
        setBrandTexts(
          brandTextMeta.map((meta) => ({
            key: meta.key,
            zh: String(zhMap[meta.key] ?? ''),
            en: String(enMap[meta.key] ?? ''),
            labelId: meta.labelId,
          })),
        );
      })
      .catch(() => {
        // 读取失败则用空值（回退默认）
        setBrandTexts(
          brandTextMeta.map((meta) => ({
            key: meta.key,
            zh: '',
            en: '',
            labelId: meta.labelId,
          })),
        );
      });
  };

  const onBrandTextChange = (
    key: string,
    lang: 'zh' | 'en',
    value: string,
  ) => {
    setBrandTexts((prev) =>
      prev.map((item) => (item.key === key ? { ...item, [lang]: value } : item)),
    );
  };

  const handleSaveBrandTexts = async () => {
    setBrandTextSaving(true);
    try {
      // 读完整 custom_messages，仅覆盖品牌文案 key，其余（自定义文案页的项）原样保留
      const existingRes = await api.siteSetting.getCustomMessages({});
      const existing = existingRes.data || {};
      const messages: Record<string, Record<string, string>> = {
        [LOCALE_ZH]: {
          ...(typeof existing[LOCALE_ZH] === 'object' &&
          existing[LOCALE_ZH] !== null
            ? existing[LOCALE_ZH]
            : {}),
        },
        [LOCALE_EN]: {
          ...(typeof existing[LOCALE_EN] === 'object' &&
          existing[LOCALE_EN] !== null
            ? existing[LOCALE_EN]
            : {}),
        },
      };
      // 兼容旧扁平结构：把扁平 key 并入 zh 分区
      for (const key of Object.keys(existing)) {
        if (key === LOCALE_ZH || key === LOCALE_EN) continue;
        if (typeof existing[key] === 'string') {
          messages[LOCALE_ZH][key] = existing[key];
        }
      }
      // 应用品牌文案编辑值；空字符串表示恢复默认（从覆盖中移除）
      for (const item of brandTexts) {
        const zh = item.zh.trim();
        const en = item.en.trim();
        if (zh !== '') {
          messages[LOCALE_ZH][item.key] = zh;
        } else {
          delete messages[LOCALE_ZH][item.key];
        }
        if (en !== '') {
          messages[LOCALE_EN][item.key] = en;
        } else {
          delete messages[LOCALE_EN][item.key];
        }
      }
      await api.siteSetting.saveCustomMessages({ messages });
      message.success(formatMessage({ id: 'site.setting.editSuccess' }));
      location.reload();
    } catch (error) {
      message.error(formatMessage({ id: 'api.networkError' }));
    } finally {
      setBrandTextSaving(false);
    }
  };

  const handleUploadBrandAsset = (type: BrandAssetType, file: File) => {
    setUploading(type);
    api.siteSetting
      .uploadBrandAsset({ type, file })
      .then(() => {
        message.success(formatMessage({ id: 'admin.brandAssetUploaded' }));
        refreshBrandAssets();
        location.reload();
      })
      .catch(() => {
        message.error(formatMessage({ id: 'admin.brandAssetUploadFail' }));
      })
      .finally(() => setUploading(null));
  };

  interface APISiteSettingFormData
    extends Omit<APISiteSetting, 'autoJoinTeamIDs'> {
    autoJoinTeamIDs: string;
  }

  const handleFinish = (values: APISiteSettingFormData) => {
    api.siteSetting
      .editSiteSetting({
        data: {
          ...values,
          autoJoinTeamIDs: textareaToArray(values.autoJoinTeamIDs),
        },
      })
      .then((result) => {
        const data = toLowerCamelCase(result.data);
        data.autoJoinTeamIDs = data.autoJoinTeamIDs.join('\n');
        form.setFieldsValue(data);
        // 弹出提示
        message.success(formatMessage({ id: 'site.setting.editSuccess' }));
      })
      .catch((error) => {
        console.log(error);
        if (error.data?.message?.autoJoinTeamIDs) {
          const line = error.data.message.autoJoinTeamIDs
            .map((line: number) => line + 1)
            .join(', ');
          error.data.message.autoJoinTeamIDs = [
            formatMessage(
              { id: 'site.setting.autoJoinTeamIDsError' },
              { line },
            ),
          ];
        }

        error.default(form);
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  useEffect(() => {
    api.siteSetting
      .getSiteSetting({})
      .then((result) => {
        const data = toLowerCamelCase(result.data);
        data.autoJoinTeamIDs = arrayToTextarea(data.autoJoinTeamIDs);
        setSiteSetting(data);
        form.setFieldsValue(data);
      })
      .finally(() => {
        setLoading(false);
      });
    refreshBrandAssets();
    refreshBrandTexts();
  }, []);

  return loading ? (
    <Spin />
  ) : (
    <div
      className={classNames('AdminSiteSetting', className)}
      css={css`
        .BrandAssetUploader {
          display: flex;
          gap: 24px;
          flex-wrap: wrap;
          margin-bottom: 8px;
        }
        .BrandAssetUploader__Item {
          width: 220px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 14px;
          border: 1px solid ${style.borderColorLight};
          border-radius: 10px;
          background: var(--moeflow-surface);
        }
        .BrandAssetUploader__Preview {
          width: 100%;
          height: 150px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px dashed ${style.borderColorLight};
          border-radius: 8px;
          overflow: hidden;
          background: var(--moeflow-adminBackground);
          img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
          }
          .BrandAssetUploader__Empty {
            color: ${style.textColorSecondary};
            font-size: 12px;
            padding: 8px;
            text-align: center;
          }
        }
        .BrandAssetUploader__Title {
          font-size: 14px;
          font-weight: 600;
        }
        .BrandAssetUploader__Tip {
          font-size: 12px;
          color: ${style.textColorSecondary};
        }
        .BrandText {
          display: flex;
          flex-direction: column;
          gap: 14px;
          margin-bottom: 24px;
          padding: 16px;
          border: 1px solid ${style.borderColorLight};
          border-radius: 10px;
          background: var(--moeflow-surface);
        }
        .BrandText__Title {
          font-size: 15px;
          font-weight: 600;
        }
        .BrandText__Desc {
          font-size: 12px;
          color: ${style.textColorSecondary};
        }
        .BrandText__Item {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .BrandText__ItemTitle {
          font-size: 13px;
          font-weight: 600;
        }
        .BrandText__Lang {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .BrandText__LangLabel {
          font-size: 12px;
          color: ${style.textColorSecondary};
        }
        .BrandText__Actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
      `}
    >
      <div className="BrandAssetUploader">
        {(
          [
            ['mascot', 'admin.brandAssetMascot', 'admin.brandAssetMascotTip'],
            ['favicon', 'admin.brandAssetFavicon', 'admin.brandAssetFaviconTip'],
          ] as const
        ).map(([type, titleId, tipId]) => (
          <div className="BrandAssetUploader__Item" key={type}>
            <span className="BrandAssetUploader__Title">
              {formatMessage({ id: titleId })}
            </span>
            <div className="BrandAssetUploader__Preview">
              {brandAssets?.[type] ? (
                <img
                  src={brandAssets[type]}
                  alt={type}
                  css={css`
                    ${type === 'favicon' ? 'width: 64px; height: 64px;' : ''}
                  `}
                />
              ) : (
                <span className="BrandAssetUploader__Empty">
                  {formatMessage({ id: 'admin.brandAssetDefault' })}
                </span>
              )}
            </div>
            <span className="BrandAssetUploader__Tip">
              {formatMessage({ id: tipId })}
            </span>
            <Upload
              accept="image/png,image/jpeg,image/webp,image/gif"
              showUploadList={false}
              beforeUpload={(file) => {
                handleUploadBrandAsset(type, file as File);
                return false;
              }}
            >
              <Button type="primary" loading={uploading === type}>
                {formatMessage({ id: 'admin.brandAssetUpload' })}
              </Button>
            </Upload>
          </div>
        ))}
      </div>
      <div
        css={css`
          margin-bottom: 20px;
          font-size: 13px;
          color: ${style.textColorSecondary};
        `}
      >
        {formatMessage({ id: 'admin.brandAsset' })}：{formatMessage({ id: 'admin.brandAssetDesc' })}
      </div>

      <div className="BrandText">
        <span className="BrandText__Title">
          {formatMessage({ id: 'admin.brandText' })}
        </span>
        <span className="BrandText__Desc">
          {formatMessage({ id: 'admin.brandTextDesc' })}
        </span>
        {brandTexts.map((item) => (
          <div className="BrandText__Item" key={item.key}>
            <span className="BrandText__ItemTitle">
              {formatMessage({ id: item.labelId })}
            </span>
            {(
              [
                ['zh', LOCALE_ZH],
                ['en', LOCALE_EN],
              ] as const
            ).map(([lang, localeLabel]) => (
              <div className="BrandText__Lang" key={lang}>
                <span className="BrandText__LangLabel">
                  {formatMessage({
                    id: lang === 'zh' ? 'admin.customMsgZh' : 'admin.customMsgEn',
                  })}
                </span>
                <TextArea
                  rows={2}
                  value={item[lang]}
                  onChange={(event) =>
                    onBrandTextChange(item.key, lang, event.target.value)
                  }
                />
              </div>
            ))}
          </div>
        ))}
        <div className="BrandText__Actions">
          <Button
            type="primary"
            loading={brandTextSaving}
            onClick={handleSaveBrandTexts}
          >
            {formatMessage({ id: 'form.submit' })}
          </Button>
        </div>
      </div>

      <Form form={form} onFinish={handleFinish} autoComplete="off">
        <FormItem
          label={formatMessage({ id: 'site.setting.onlyAllowAdminCreateTeam' })}
          name="onlyAllowAdminCreateTeam"
        >
          <Switch defaultChecked={siteSetting?.onlyAllowAdminCreateTeam} />
        </FormItem>
        <FormItem
          label={formatMessage({ id: 'site.setting.autoJoinTeamIDs' })}
          name="autoJoinTeamIDs"
          tooltip={formatMessage({ id: 'site.setting.autoJoinTeamIDsTip' })}
        >
          <TextArea rows={10} />
        </FormItem>
        <FormItem
          label={formatMessage({ id: 'site.setting.homepageHtml' })}
          name="homepageHtml"
        >
          <TextArea rows={10} />
        </FormItem>
        <FormItem
          label={formatMessage({ id: 'site.setting.homepageCss' })}
          name="homepageCss"
        >
          <TextArea rows={10} />
        </FormItem>

        <FormItem
          css={css`
            text-align: right;
          `}
        >
          <Button type="primary" htmlType="submit" loading={submitting}>
            {formatMessage({ id: 'form.submit' })}
          </Button>
        </FormItem>
      </Form>
    </div>
  );
};
