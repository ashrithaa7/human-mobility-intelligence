from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging

from app.config import settings, get_logger
from app.routers import health, analytics, admin, data, planning

# Initialize logger
logger = get_logger(__name__)

# Create FastAPI app
app = FastAPI(
    title=settings.api_title,
    version=settings.api_version,
    description="Spatiotemporal Movement Pattern Discovery and Urban Planning Decision Support",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router)
app.include_router(analytics.router)
app.include_router(admin.router)
app.include_router(data.router)
app.include_router(data.realtime_router)
app.include_router(planning.router)

@app.on_event("startup")
async def startup_event():
    logger.info(f"Starting {settings.app_name} v{settings.version}")
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"Data Mode: {settings.data_mode}")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down application")

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Human Mobility Intelligence API",
        "version": settings.api_version,
        "environment": settings.environment,
    }

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
    )
