from datetime import datetime, timedelta, timezone
from app.services import auth_service
from app.models.register import RegisterSessionDocument
import sys

# Just verify we can load RegisterSessionDocument
if RegisterSessionDocument:
    sys.exit(0)
