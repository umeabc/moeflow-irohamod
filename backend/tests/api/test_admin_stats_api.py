from app.constants.project import ProjectStatus
from app.exceptions import NeedTokenError, NoPermissionError
from app.models.project import Project
from tests import MoeAPITestCase


class ContributionStatsAPITestCase(MoeAPITestCase):
    def test_current_image_assignments(self):
        admin = self.create_user('stats-admin')
        admin.update(admin=True)
        admin.reload()
        alice = self.create_user('Alice')
        bob = self.create_user('Bob')
        zero = self.create_user('Zero')
        banned = self.create_user('Banned')
        banned.update(banned=True)
        redacted = self.create_user('[Redacted]')
        project = self.create_project('stats')
        # Multiple roles, all separators, whitespace, duplicates and exact matching.
        image = project.create_file('one.jpg')
        image.update(translator=' Alice、Bob，Alice, Bob ,,alice,Unknown,Banned,[Redacted] ',
                     proofreader='Alice', typesetter='Alice，Bob')
        for status in (ProjectStatus.FINISHED, ProjectStatus.ARCHIVED,
                       ProjectStatus.PLAN_FINISH, ProjectStatus.PLAN_DELETE):
            historical = Project.create(
                f'history-{status}', project.team, creator=self.get_creator(project.team),
                project_set=project.project_set,
            )
            historical.update(status=status)
            historical.create_file(f'{status}.jpg').update(translator='Bob')
        project.create_file('inactive.jpg').update(activated=False, translator='Alice')
        project.create_file('text.txt').update(translator='Alice')
        project.create_folder('folder').update(translator='Alice')
        response = self.get('/v1/admin/contribution-stats', token=admin.generate_token())
        self.assertErrorEqual(response)
        rows = response.json
        by_name = {row['name']: row for row in rows}
        self.assertEqual(by_name['Alice'], dict(user_id=str(alice.id), name='Alice',
                         email=alice.email, translator_count=1, proofreader_count=1,
                         typesetter_count=1, total=3))
        self.assertEqual(by_name['Bob']['translator_count'], 5)
        self.assertEqual(by_name['Bob']['typesetter_count'], 1)
        self.assertEqual(by_name['Bob']['total'], 6)
        self.assertEqual(by_name[zero.name]['total'], 0)
        self.assertNotIn(banned.name, by_name)
        self.assertNotIn(redacted.name, by_name)
        self.assertEqual(len(rows), 6)  # default user, admin, Alice, Bob, Zero, project creator
        self.assertEqual(rows, sorted(rows, key=lambda row: (-row['total'], row['name'])))

    def test_admin_required(self):
        self.assertErrorEqual(self.get('/v1/admin/contribution-stats'), NeedTokenError)
        user = self.create_user('ordinary')
        self.assertErrorEqual(self.get('/v1/admin/contribution-stats',
                              token=user.generate_token()), NoPermissionError)


class MoveTargetProjectsAPITestCase(MoeAPITestCase):
    def test_only_working_same_type_targets(self):
        source = self.create_project('source')
        creator = self.get_creator(source.team)
        for proofread in (False, True):
            for author in (False, True):
                source.update(with_proofread=proofread, with_author=author)
                source.reload()
                targets = []
                for status in (ProjectStatus.WORKING, ProjectStatus.FINISHED,
                               ProjectStatus.ARCHIVED, ProjectStatus.PLAN_FINISH,
                               ProjectStatus.PLAN_DELETE, ProjectStatus.DELETED):
                    target = Project.create(f'target-{proofread}-{author}-{status}',
                        source.team, creator=creator, project_set=source.project_set,
                        with_proofread=proofread, with_author=author)
                    target.update(status=status)
                    targets.append(target)
                response = self.get(f'/v1/projects/{source.id}/move-target-projects',
                                    token=creator.generate_token())
                self.assertErrorEqual(response)
                self.assertEqual(response.json, [{'id': str(targets[0].id), 'name': targets[0].name}])

    def test_move_permission(self):
        source = self.create_project('source')
        user = self.create_user('outsider')
        self.assertErrorEqual(self.get(f'/v1/projects/{source.id}/move-target-projects'),
                              NeedTokenError)
        self.assertErrorEqual(self.get(f'/v1/projects/{source.id}/move-target-projects',
                              token=user.generate_token()), NoPermissionError)
