from typing import Literal, Union

from pydantic import BaseModel, Field


PLCProtocolName = Literal["TCP", "RTU", "SLMP"]


class PLCConnectRequest(BaseModel):
    protocol_type: PLCProtocolName = "TCP"
    ip: str = "192.168.0.250"
    port: Union[int, str] = 502
    tries: int = Field(default=1, ge=1, le=10)
    baudrate: int = 9600
    parity: str = "N"
    stopbits: int = 1
    bytesize: int = 8
    slave_id: int = 1
    plc_type: str = "Q"
    comm_type: str = "binary"


class PLCReadRequest(BaseModel):
    address: int = Field(ge=0)
    count: int = Field(default=1, ge=1, le=128)


class PLCWriteRequest(BaseModel):
    address: int = Field(ge=0)
    value: bool


class PLCLightRequest(BaseModel):
    enabled: bool


class PLCErrorPulseRequest(BaseModel):
    duration_ms: int = Field(default=500, ge=1, le=10000)
