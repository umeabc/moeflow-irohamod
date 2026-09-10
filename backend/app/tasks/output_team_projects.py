"""
导出项目
"""

import datetime
from flask import Flask

from app import celery

from app.constants.output import OutputTypes
from app.constants.project import ProjectStatus
from app.models import connect_db
from app.tasks.output_project import output_project
from . import SyncResult
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)


@celery.task(name="tasks.output_team_projects_task")
def output_team_projects_task(team_id, current_user_id):
    """
    创建团队的所有项目的导出任务

    :param team_id: 团队Id
    :return:
    """
    from app.models.file import File
    from app.models.project import Project
    from app.models.output import Output
    from app.models.team import Team
    from app.models.target import Target
    from app.models.user import User

    (File, Project, Team, Target, User)
    connect_db(celery.conf.app_config)
    app = Flask(__name__)
    app.config.from_object(celery.conf.app_config)

    OUTPUT_WAIT_SECONDS = celery.conf.app_config.get("OUTPUT_WAIT_SECONDS", 60 * 5)
    current_user = User.by_id(current_user_id)

    team = Team.by_id(team_id)
    for project in team.projects(status=ProjectStatus.WORKING):
        for target in project.targets():
            # 等待一定时间后允许再次导出
            last_output = target.outputs().first()
            if last_output and (
                datetime.datetime.utcnow() - last_output.create_time
                < datetime.timedelta(seconds=OUTPUT_WAIT_SECONDS)
            ):
                continue
            # 删除导出：保留「最近 3 个」且「最近 7 天」内的
            # 删除条件：7 天以前 且 不在最近 3 个内
            cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=7)
            latest_three_ids = {
                str(o.id) for o in target.outputs().limit(3)
            }
            old_targets = [
                o
                for o in target.outputs().filter(create_time__lt=cutoff)
                if str(o.id) not in latest_three_ids
            ]
            if old_targets:
                Output.delete_real_files(old_targets)
                for o in old_targets:
                    o.delete()
            # 创建新target
            output = Output.create(
                project=project,
                target=target,
                user=current_user,
                type=OutputTypes.ALL,
            )
            output_project(str(output.id))

    return f"成功：已创建 Team <{str(team.id)}> 所有项目的导出任务"


def output_team_projects(team_id, current_user_id, /, *, run_sync=False):
    alive_workers = celery.control.ping()
    if len(alive_workers) == 0 or run_sync:
        # 同步执行
        output_team_projects_task(team_id, current_user_id)
        return SyncResult()
    else:
        # 异步执行
        return output_team_projects_task.delay(team_id, current_user_id)
