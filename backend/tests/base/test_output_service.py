import datetime
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import Mock, patch


def load_output_service():
    """Load the service with local stubs, without database or cloud dependencies."""
    module_names = (
        "app",
        "app.constants",
        "app.constants.output",
        "app.models",
        "app.models.output",
        "app.tasks",
        "app.tasks.output_project",
    )
    saved_modules = {name: sys.modules.get(name) for name in module_names}
    modules = {name: types.ModuleType(name) for name in module_names}
    modules["app.constants.output"].OutputTypes = types.SimpleNamespace(ALL=1)
    modules["app.models.output"].Output = Mock()
    modules["app.tasks.output_project"].output_project = Mock()
    sys.modules.update(modules)
    service_path = (
        Path(__file__).resolve().parents[2] / "app" / "services" / "output.py"
    )
    spec = importlib.util.spec_from_file_location("tested_output_service", service_path)
    service = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(service)
    finally:
        for name, module in saved_modules.items():
            if module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module
    return service


service = load_output_service()
NOW = datetime.datetime(2026, 1, 15, 12)


class FakeOutput:
    def __init__(self, output_id, create_time):
        self.id = output_id
        self.create_time = create_time
        self.delete = Mock()


class FakeOutputs:
    def __init__(self, outputs):
        self._outputs = outputs

    def first(self):
        return self._outputs[0] if self._outputs else None

    def limit(self, count):
        return self._outputs[:count]

    def filter(self, create_time__lt):
        return [
            output
            for output in self._outputs
            if output.create_time < create_time__lt
        ]


class FakeTarget:
    def __init__(self, outputs):
        self._outputs = FakeOutputs(outputs)

    def outputs(self):
        return self._outputs


class OutputServiceTestCase(unittest.TestCase):
    def setUp(self):
        service.Output.reset_mock()
        self.datetime_patcher = patch.object(service, "datetime")
        datetime_module = self.datetime_patcher.start()
        datetime_module.datetime.utcnow.return_value = NOW
        datetime_module.datetime.side_effect = datetime.datetime
        datetime_module.timedelta.side_effect = datetime.timedelta

    def tearDown(self):
        self.datetime_patcher.stop()

    def test_cleans_only_old_outputs_outside_latest_three(self):
        old = datetime.timedelta(days=8)
        latest = [FakeOutput(f"latest-{index}", NOW - old) for index in range(3)]
        removed = FakeOutput("old", NOW - old)
        recent = FakeOutput("recent", NOW - datetime.timedelta(days=1))
        target = FakeTarget(latest + [removed, recent])
        project = Mock()
        project.targets.return_value = [target]
        current_user = Mock()
        created = Mock(id="new-output")
        service.Output.create.return_value = created

        with patch.object(service, "output_project") as output_project:
            result = service.create_all_outputs(project, current_user)

        self.assertEqual([created], result)
        service.Output.delete_real_files.assert_called_once_with([removed])
        removed.delete.assert_called_once_with()
        for output in latest + [recent]:
            output.delete.assert_not_called()
        service.Output.create.assert_called_once_with(
            project=project,
            target=target,
            user=current_user,
            type=service.OutputTypes.ALL,
        )
        output_project.assert_called_once_with("new-output")

    def test_skips_target_during_cooldown(self):
        target = FakeTarget(
            [FakeOutput("recent", NOW - datetime.timedelta(seconds=30))]
        )
        project = Mock()
        project.targets.return_value = [target]

        with patch.object(service, "output_project") as output_project:
            result = service.create_all_outputs(
                project, Mock(), output_wait_seconds=60
            )

        self.assertEqual([], result)
        service.Output.create.assert_not_called()
        service.Output.delete_real_files.assert_not_called()
        output_project.assert_not_called()


if __name__ == "__main__":
    unittest.main()
