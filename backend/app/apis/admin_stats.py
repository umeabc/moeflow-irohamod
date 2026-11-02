"""Admin statistics from current image assignments."""

import re

from app.constants.file import FileType
from app.core.views import MoeAPIView
from app.decorators.auth import admin_required
from app.models.file import File
from app.models.user import User


class AdminContributionStatsAPI(MoeAPIView):
    @admin_required
    def get(self):
        roles = ("translator", "proofreader", "typesetter")
        rows = {}
        for user in User.objects(banned__ne=True).only("id", "name", "email"):
            if user.name.startswith("[Redacted]"):
                continue
            rows[user.name] = {
                "user_id": str(user.id),
                "name": user.name,
                "email": user.email,
                **{f"{role}_count": 0 for role in roles},
                "total": 0,
            }
        # Include projects of every status.
        for image in File.objects(type=FileType.IMAGE, activated=True).only(*roles):
            for role in roles:
                names = {
                    name.strip()
                    for name in re.split(r"[、，,]", getattr(image, role) or "")
                }
                for name in names:
                    if name in rows:
                        rows[name][f"{role}_count"] += 1
                        rows[name]["total"] += 1
        return sorted(rows.values(), key=lambda row: (-row["total"], row["name"]))
