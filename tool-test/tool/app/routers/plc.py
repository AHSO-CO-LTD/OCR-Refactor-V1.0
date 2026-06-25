from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from tool.app.schemas.common import SuccessResponse
from tool.app.schemas.plc import (
    PLCConnectRequest,
    PLCErrorPulseRequest,
    PLCLightRequest,
    PLCReadRequest,
    PLCWriteRequest,
)
from tool.app.services.runtime import plc_service

router = APIRouter(prefix="/plc", tags=["plc"])


class PLCPulseRequest(PLCWriteRequest):
    duration_ms: int = Field(default=500, ge=1, le=10000)


@router.get("/status")
def status():
    return {"success": True, "data": plc_service.status()}


@router.post("/connect", response_model=SuccessResponse)
def connect_plc(payload: PLCConnectRequest):
    try:
        return SuccessResponse(data=plc_service.connect(**payload.model_dump()))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/disconnect", response_model=SuccessResponse)
def disconnect_plc():
    return SuccessResponse(data=plc_service.disconnect())


@router.post("/read")
def read_coils(payload: PLCReadRequest):
    try:
        return plc_service.read_coils(**payload.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/signals")
def read_machine_signals():
    try:
        return plc_service.read_machine_signals()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/write")
def write_coil(payload: PLCWriteRequest):
    try:
        return plc_service.write_coil(**payload.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/light")
def set_light(payload: PLCLightRequest):
    try:
        return plc_service.set_light(payload.enabled)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/pulse")
def pulse_coil(payload: PLCPulseRequest):
    try:
        return plc_service.pulse_coil(**payload.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/error-pulse")
def pulse_error(payload: PLCErrorPulseRequest):
    try:
        return plc_service.pulse_error(payload.duration_ms)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
