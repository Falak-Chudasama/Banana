from enum import Enum
import time
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    CREATED = "created"
    QUEUED = "queued"
    FETCHING_METADATA = "fetching_metadata"
    DOWNLOADING = "downloading"
    POST_PROCESSING = "post_processing"
    PACKAGING = "packaging"
    READY = "ready"
    TRANSFERRING = "transferring"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class JobType(str, Enum):
    DOWNLOAD = "download"
    TRIM = "trim"
    PLAYLIST_PARENT = "playlist_parent"
    PLAYLIST_ITEM = "playlist_item"


class ErrorCode(str, Enum):
    INVALID_URL = "invalid_url"
    UNSUPPORTED_SOURCE = "unsupported_source"
    MEDIA_UNAVAILABLE = "media_unavailable"
    NO_AVAILABLE_FORMAT = "no_available_format"
    NETWORK_TIMEOUT = "network_timeout"
    SOURCE_RATE_LIMITED = "source_rate_limited"
    SOURCE_ACCESS_DENIED = "source_access_denied"
    CDN_URL_EXPIRED = "cdn_url_expired"
    DOWNLOAD_INTERRUPTED = "download_interrupted"
    FFMPEG_NOT_FOUND = "ffmpeg_not_found"
    POSTPROCESSING_FAILED = "postprocessing_failed"
    DISK_FULL = "disk_full"
    TEMP_STORAGE_ERROR = "temp_storage_error"
    TOKEN_INVALID = "token_invalid"
    TOKEN_EXPIRED = "token_expired"
    TRANSFER_INTERRUPTED = "transfer_interrupted"
    CLIENT_CANCELLED = "client_cancelled"
    INTERNAL_ERROR = "internal_error"


class JobEvent(BaseModel):
    event_id: int
    job_id: str
    type: str  # job_created, queued, stage_changed, progress, postprocessing, ready, transfer_started, transfer_progress, completed, failed, cancelled, expired, heartbeat
    status: JobStatus
    stage: str
    percent: Optional[float] = None
    is_estimated_percent: bool = False
    downloaded_bytes: int = 0
    total_bytes: Optional[int] = None
    speed_bytes_per_second: Optional[float] = None
    eta_seconds: Optional[int] = None
    message: str = ""
    timestamp: float = Field(default_factory=time.time)
    extra: Optional[Dict[str, Any]] = None


class JobRecord(BaseModel):
    job_id: str
    job_type: JobType
    status: JobStatus = JobStatus.CREATED
    parent_job_id: Optional[str] = None
    child_job_ids: List[str] = Field(default_factory=list)

    # Media parameters
    url: str
    format: str = "mp4"  # "mp3" or "mp4"
    quality: str = "best"
    start_time: Optional[float] = None
    end_time: Optional[float] = None

    # Metadata
    title: str = "Preparing media..."
    uploader: Optional[str] = None
    duration: Optional[float] = None
    thumbnail: Optional[str] = None

    # Timing
    created_at: float = Field(default_factory=time.time)
    updated_at: float = Field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    expires_at: Optional[float] = None

    # File output
    output_filename: Optional[str] = None
    output_extension: Optional[str] = None
    content_type: Optional[str] = None
    output_size_bytes: Optional[int] = None
    download_token: Optional[str] = None

    # Download metrics
    downloaded_bytes: int = 0
    total_bytes: Optional[int] = None
    is_estimated_percent: bool = False
    download_speed: Optional[float] = None
    eta_seconds: Optional[int] = None
    percent: Optional[float] = None

    # Browser transfer tracking
    transfer_bytes_sent: int = 0
    transfer_attempt_count: int = 0
    active_transfers: int = 0

    # Human-readable progress
    current_stage: str = "created"
    current_message: str = "Job created"

    # Errors & Cancellation
    cancellation_requested: bool = False
    error_code: Optional[ErrorCode] = None
    user_facing_error: Optional[str] = None
    technical_error_reference: Optional[str] = None

    # Playlist specific aggregation
    playlist_total_tracks: Optional[int] = None
    playlist_completed_tracks: Optional[int] = None
    playlist_failed_tracks: Optional[int] = None
    playlist_current_track_index: Optional[int] = None
    playlist_current_track_title: Optional[str] = None

    def to_client_dict(self) -> Dict[str, Any]:
        """Return safe client-facing dictionary (no internal paths)."""
        data = self.model_dump(mode="json")
        # Ensure enums serialize as strings
        data["status"] = self.status.value
        data["job_type"] = self.job_type.value
        if self.error_code:
            data["error_code"] = self.error_code.value
        return data

