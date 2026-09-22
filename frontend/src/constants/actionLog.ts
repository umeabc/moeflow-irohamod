// 操作日志动作类型 → 中文名称
export const ACTION_LOG_TYPES: Record<string, string> = {
  'auth.login': '登录',
  'auth.visit_login_page': '已登录访问登录页',
  'user.register': '注册',
  'user.update_info': '修改个人资料',
  'user.change_email': '修改邮箱',
  'user.change_password': '修改密码',
  'user.create_by_admin': '管理员新建用户',
  'user.reset_password': '管理员重置密码',
  'user.deactivate': '注销用户',
  'user.change_admin_status': '修改管理员状态',
  'project.create': '创建项目',
  'project.edit': '修改项目',
  'project.finish': '完结项目',
  'project.resume': '恢复项目',
  'project.add_target': '新增目标语言',
  'project.output': '导出项目',
  'project.target_output': '导出目标翻译',
  'team.create': '创建团队',
  'team.edit': '修改团队',
  'team.delete': '解散团队',
  'team.output_all_projects': '导出团队全部项目',
  'file.upload': '上传文件',
  'file.move': '移动文件',
  'file.edit': '修改文件',
  'file.delete': '删除文件',
  'file.ocr': 'OCR 识别',
  'file.safe_check': '安全审核',
  'file.import_from_url': '社交媒体图片导入',
  'translation.create': '创建翻译',
  'translation.edit': '修改翻译',
  'translation.delete': '删除翻译',
};

// 操作类型中文名（未知动作类型时回退为原始 code）
export const getActionTypeLabel = (actionType: string): string =>
  ACTION_LOG_TYPES[actionType] || actionType;
