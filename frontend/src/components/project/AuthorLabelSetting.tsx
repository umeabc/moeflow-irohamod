import { css } from '@emotion/core';
import { Button, Input, message, Tag } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { useDispatch, useSelector } from 'react-redux';
import api from '../../apis';
import { PROJECT_PERMISSION } from '@/constants';
import { Project } from '@/interfaces';
import { AppState } from '@/store';
import { editProject, setCurrentProject } from '@/store/project/slice';
import style from '../../style';
import { toLowerCamelCase } from '@/utils';
import { can } from '@/utils/user';

/** 可插入的作者信息占位符（与后端 AUTHOR_TEMPLATE_PLACEHOLDERS 对应） */
const AUTHOR_PLACEHOLDERS = ['翻译', '嵌字', '原作者'] as const;
const PLACEHOLDER_TOKEN_RE = /\{(翻译|嵌字|原作者)\}/g;

/** 预览用的示例负责人 */
const PREVIEW_VALUES: Record<string, string> = {
  翻译: '张三',
  嵌字: '李四',
  原作者: '王五',
};

/**
 * 按模板渲染作者信息（预览用，规则与后端 render_author_label 保持一致）：
 * - 某一行的占位符全为空值时整行省略；
 * - 模板里的纯文本原样保留（即「每张都先加」的自定义文案）。
 */
export const renderAuthorTemplatePreview = (
  template: string,
  values: Record<string, string> = PREVIEW_VALUES,
) => {
  const lines: string[] = [];
  template
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((rawLine) => {
      const names = rawLine.match(PLACEHOLDER_TOKEN_RE) || [];
      const hasValue = names.some(
        (token) => values[token.slice(1, token.length - 1)],
      );
      if (names.length > 0 && !hasValue) {
        return;
      }
      lines.push(
        rawLine.replace(
          PLACEHOLDER_TOKEN_RE,
          (_, name: string) => values[name] || '',
        ),
      );
    });
  return lines.join('\n').replace(/^\n+|\n+$/g, '');
};

/**
 * 作者信息设置（仅「启用原作者」的项目显示）
 * 模板里 {翻译}/{嵌字}/{原作者} 会替换成该图负责人，其余文字作为固定文案加到每张图。
 */
export const AuthorLabelSetting = () => {
  const { formatMessage } = useIntl();
  const dispatch = useDispatch();
  const currentProject = useSelector(
    (state: AppState) => state.project.currentProject,
  ) as Project;
  const [template, setTemplate] = useState(
    currentProject.authorLabelTemplate || '',
  );
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<any>(null);

  useEffect(() => {
    setTemplate(currentProject.authorLabelTemplate || '');
  }, [currentProject.id, currentProject.authorLabelTemplate]);

  const editable = can(currentProject, PROJECT_PERMISSION.CHANGE);
  const preview = useMemo(() => renderAuthorTemplatePreview(template), [
    template,
  ]);
  const dirty = template !== (currentProject.authorLabelTemplate || '');

  const insertPlaceholder = (name: string) => {
    const token = `{${name}}`;
    const textarea: HTMLTextAreaElement | undefined =
      textareaRef.current?.resizableTextArea?.textArea;
    if (!textarea) {
      setTemplate((prev) => prev + token);
      return;
    }
    const start = textarea.selectionStart ?? template.length;
    const end = textarea.selectionEnd ?? start;
    const next = template.slice(0, start) + token + template.slice(end);
    setTemplate(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = () => {
    setSaving(true);
    api
      .editProject({
        id: currentProject.id,
        // 只提交作者信息模板；其余字段由后端按需校验
        data: { authorLabelTemplate: template } as any,
      })
      .then((result: any) => {
        const data = toLowerCamelCase(result.data);
        if (data?.project) {
          dispatch(editProject(data.project));
          dispatch(setCurrentProject(data.project));
        }
        message.success(
          formatMessage({ id: 'project.authorInfoSaved' }),
        );
      })
      .catch((error) => {
        error.default?.();
      })
      .finally(() => setSaving(false));
  };

  return (
    <div
      className="AuthorLabelSetting"
      css={css`
        width: 100%;
        .AuthorLabelSetting__Tip {
          font-size: 12px;
          line-height: 18px;
          color: ${style.textColorSecondary};
          margin-bottom: 8px;
        }
        .AuthorLabelSetting__Placeholders {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
          margin: 8px 0;
          font-size: 12px;
          color: ${style.textColorSecondary};
        }
        .AuthorLabelSetting__Placeholders .ant-tag {
          margin: 0;
          cursor: pointer;
          user-select: none;
        }
        .AuthorLabelSetting__Preview {
          margin-top: 8px;
          padding: 8px 10px;
          border-radius: ${style.borderRadiusSm};
          background-color: var(--moeflow-surface);
          border: 1px dashed var(--moeflow-borderColorLight);
          font-size: 12px;
          line-height: 20px;
          white-space: pre-wrap;
          word-break: break-word;
          min-height: 20px;
          color: ${style.textColor};
        }
        .AuthorLabelSetting__PreviewLabel {
          font-size: 12px;
          color: ${style.textColorSecondary};
          margin-top: 8px;
        }
        .AuthorLabelSetting__Footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-top: 8px;
        }
        .AuthorLabelSetting__Count {
          font-size: 12px;
          color: ${style.textColorSecondary};
        }
      `}
    >
      <div className="AuthorLabelSetting__Tip">
        {formatMessage({ id: 'project.authorInfoTip' })}
      </div>
      <Input.TextArea
        ref={textareaRef}
        className="AuthorLabelSetting__Input"
        value={template}
        rows={5}
        maxLength={1000}
        disabled={!editable || saving}
        placeholder={formatMessage({ id: 'project.authorInfoPlaceholder' })}
        onChange={(e) => setTemplate(e.target.value)}
      />
      {editable && (
        <div className="AuthorLabelSetting__Placeholders">
          <span>{formatMessage({ id: 'project.authorInfoInsert' })}</span>
          {AUTHOR_PLACEHOLDERS.map((name) => (
            <Tag key={name} onClick={() => insertPlaceholder(name)}>
              {`{${name}}`}
            </Tag>
          ))}
        </div>
      )}
      <div className="AuthorLabelSetting__PreviewLabel">
        {formatMessage({ id: 'project.authorInfoPreview' })}
      </div>
      <div className="AuthorLabelSetting__Preview">
        {preview || formatMessage({ id: 'project.authorInfoEmptyPreview' })}
      </div>
      {editable && (
        <div className="AuthorLabelSetting__Footer">
          <span className="AuthorLabelSetting__Count">{`${template.length}/1000`}</span>
          <Button
            type="primary"
            loading={saving}
            disabled={!dirty}
            onClick={save}
          >
            {formatMessage({ id: 'project.authorInfoSave' })}
          </Button>
        </div>
      )}
    </div>
  );
};
