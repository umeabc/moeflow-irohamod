"""导出任务共用的服务逻辑。"""

import datetime

from app.constants.output import OutputTypes
from app.models.output import Output
from app.tasks.output_project import output_project


def create_all_outputs(project, current_user, output_wait_seconds=60 * 5):
    """为项目的所有目标创建 ALL 导出，返回本次创建的输出列表。

    处于冷却期的目标会被跳过；旧导出仅在其早于七天且不属于最近三个时删除。
    """
    outputs = []
    for target in project.targets():
        last_output = target.outputs().first()
        if last_output and (
            datetime.datetime.utcnow() - last_output.create_time
            < datetime.timedelta(seconds=output_wait_seconds)
        ):
            continue

        cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=7)
        latest_three_ids = {str(o.id) for o in target.outputs().limit(3)}
        old_outputs = [
            output
            for output in target.outputs().filter(create_time__lt=cutoff)
            if str(output.id) not in latest_three_ids
        ]
        if old_outputs:
            Output.delete_real_files(old_outputs)
            for output in old_outputs:
                output.delete()

        output = Output.create(
            project=project,
            target=target,
            user=current_user,
            type=OutputTypes.ALL,
        )
        output_project(str(output.id))
        outputs.append(output)
    return outputs
