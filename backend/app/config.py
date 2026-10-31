from pydantic_settings import BaseSettings
from typing import List
import logging

class Settings(BaseSettings):
    """Application configuration from environment variables"""
    
    # Application
    app_name: str = "Human Mobility Intelligence API"
    version: str = "0.1.0"
    environment: str = "development"
    debug: bool = True
    log_level: str = "INFO"
    
    # Frontend
    frontend_origins: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    
    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    gtfs_rt_feeds: list[dict] = []
    
    # Data
    data_mode: str = "historical"
    synthetic_data_enabled: bool = False
    
    # API
    api_title: str = "Human Mobility Intelligence API"
    api_version: str = "0.1.0"
    
    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()

def get_logger(name: str) -> logging.Logger:
    """Get configured logger"""
    logger = logging.getLogger(name)
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(getattr(logging, settings.log_level))
    return logger
