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

  const refreshBrandAssets = () => {
    api.siteSetting
      .getBrandAssets({})
      .then((result) => setBrandAssets(result.data))
      .catch(() => setBrandAssets(null));
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
