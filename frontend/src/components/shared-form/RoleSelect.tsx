import { css } from '@emotion/core';
import { Select } from 'antd';
import { SelectValue } from 'antd/lib/select';
import classNames from 'classnames';
import { useSelector } from 'react-redux';
import { TEAM_PERMISSION } from '@/constants';
import { FC, Project, Role, UserTeam } from '@/interfaces';
import { User } from '@/interfaces/user';
import { AppState } from '@/store';
import { can } from '@/utils/user';

const { Option } = Select;

/** 角色切换器的属性接口 */
interface RoleSelectProps {
  roles?: Role[];
  user: User & { role: Role };
  group: UserTeam | Project;
  onChange?: (user: User, roleID: string) => void;
  className?: string;
}
/**
 * 角色切换器
 */
export const RoleSelect: FC<RoleSelectProps> = ({
  roles,
  user,
  group,
  onChange,
  className,
}) => {
  const userIsAdmin = useSelector((state: AppState) => state.user.admin);
  const isInherited =
    group.groupType === 'project' && group.autoBecomeProjectAdmin;
  const isSuperAdmin = userIsAdmin && Boolean(group.role) && !isInherited;
  // 确保当前值始终有对应选项：roles 不含「创建人」时（如类型接口未传 with_creator），
  // 受控 Select 的 value 无匹配 Option 会直接显示原始 id，这里把当前角色兜底补进选项
  const roleOptions = roles ?? [];
  const options = roleOptions.some((r) => r.id === user.role.id)
    ? roleOptions
    : [user.role, ...roleOptions];
  return (
    <Select
      disabled={
        isSuperAdmin
          ? !roles
          : !roles ||
            user.role.systemCode === 'creator' ||
            !can(group, TEAM_PERMISSION.CHANGE_USER_ROLE) ||
            group.role.level <= user.role.level
      }
      className={classNames('RoleSelect', className)}
      css={css`
        width: 100%;
      `}
      loading={!roles}
      defaultValue={user.role.id}
      value={user.role.id}
      onChange={(roleID: SelectValue) => {
        onChange?.(user, roleID as string);
      }}
    >
      {!isSuperAdmin && user.role.systemCode === 'creator' ? ( // 创建人
        <Option value={user.role.id} key={user.role.id}>
          {user.role.name}
        </Option>
      ) : (
        options.map((type) => {
          return (
            <Option
              value={type.id}
              key={type.id}
              disabled={!isSuperAdmin && group.role.level <= type.level}
            >
              {type.name}
            </Option>
          );
        })
      )}
    </Select>
  );
};
