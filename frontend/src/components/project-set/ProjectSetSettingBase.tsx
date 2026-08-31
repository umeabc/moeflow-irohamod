import { css } from '@emotion/core';
import { Button, Modal, message } from 'antd';
import { useIntl } from 'react-intl';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';
import {
  Content,
  ContentItem,
  ContentTitle,
  ProjectSetEditForm,
} from '@/components';
import apis from '@/apis';
import { FC, UserProjectSet } from '@/interfaces';
import { AppState } from '@/store';
import { deleteProjectSet } from '@/store/projectSet/slice';
import style from '@/style';

/** 项目集基础设置的属性接口 */
interface ProjectSetSettingBaseProps {
  className?: string;
}
/**
 * 项目集基础设置
 */
export const ProjectSetSettingBase: FC<ProjectSetSettingBaseProps> = ({
  className,
}) => {
  const { formatMessage } = useIntl(); // i18n
  const dispatch = useDispatch();
  const history = useHistory();
  const currentProjectSet = useSelector(
    (state: AppState) => state.projectSet.currentProjectSet,
  ) as UserProjectSet;
  const user = useSelector((state: AppState) => state.user);

  const handleDelete = () => {
    Modal.confirm({
      title: formatMessage({
        id: 'projectSet.deleteTitle',
        defaultMessage: '删除该项目集？',
      }),
      content: formatMessage({
        id: 'projectSet.deleteTip',
        defaultMessage:
          '删除后该项目集及其下所有项目将一并永久删除，不可恢复。建议先备份。',
      }),
      okText: formatMessage({ id: 'form.ok' }),
      cancelText: formatMessage({ id: 'form.cancel' }),
      okType: 'danger',
      onOk: () => {
        return apis
          .deleteProjectSet({ id: currentProjectSet.id })
          .then(() => {
            dispatch(deleteProjectSet({ id: currentProjectSet.id }));
            message.success(
              formatMessage({
                id: 'site.deleteSuccess',
                defaultMessage: '删除成功',
              }),
            );
            history.goBack();
          })
          .catch((error) => {
            error.default();
          });
      },
    });
  };

  return (
    <div
      className={className}
      css={css`
        width: 100%;
        max-width: ${style.contentMaxWidth}px;
        padding: ${style.paddingBase}px;
      `}
    >
      <Content>
        <ContentTitle>{formatMessage({ id: 'projectSet.info' })}</ContentTitle>
        <ContentItem>
          <ProjectSetEditForm />
        </ContentItem>
      </Content>
      <Content>
        <ContentTitle>
          {formatMessage({
            id: 'projectSet.dangerZone',
            defaultMessage: '危险操作',
          })}
        </ContentTitle>
        <ContentItem>
          <Button
            danger
            type="primary"
            onClick={handleDelete}
            disabled={Boolean(currentProjectSet?.default) || !user.admin}
          >
            {formatMessage({
              id: 'projectSet.deleteButton',
              defaultMessage: '删除本项目集',
            })}
          </Button>
        </ContentItem>
      </Content>
    </div>
  );
};
