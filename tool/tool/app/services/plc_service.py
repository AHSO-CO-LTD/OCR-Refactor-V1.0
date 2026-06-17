import threading
import time
from abc import ABC, abstractmethod
from typing import List, Optional


class PLCProtocol(ABC):
    @abstractmethod
    def connect(self, **kwargs) -> bool:
        raise NotImplementedError

    @abstractmethod
    def disconnect(self):
        raise NotImplementedError

    @abstractmethod
    def read_coils(self, address: int, count: int):
        raise NotImplementedError

    @abstractmethod
    def write_coil(self, address: int, value: bool):
        raise NotImplementedError

    @abstractmethod
    def is_connected(self) -> bool:
        raise NotImplementedError


class ModbusTCPProtocol(PLCProtocol):
    COIL_OFFSET = 8192

    def __init__(self):
        self.client = None
        self._connected = False

    def connect(self, ip="192.168.0.250", port=502, **kwargs) -> bool:
        from pymodbus.client import ModbusTcpClient

        self.client = ModbusTcpClient(ip, port=int(port))
        self._connected = self.client.connect()
        return self._connected

    def disconnect(self):
        if self.client:
            self.client.close()
        self._connected = False

    def read_coils(self, address: int, count: int):
        if not self.client:
            return None
        return self.client.read_coils(address=address + self.COIL_OFFSET, count=count)

    def write_coil(self, address: int, value: bool):
        if not self.client:
            return None
        return self.client.write_coil(address=address + self.COIL_OFFSET, value=value)

    def is_connected(self) -> bool:
        return self._connected


class ModbusRTUProtocol(PLCProtocol):
    COIL_OFFSET = 8192

    def __init__(self):
        self.client = None
        self._connected = False
        self.slave_id = 1

    def connect(
        self,
        port="COM1",
        baudrate=9600,
        parity="N",
        stopbits=1,
        bytesize=8,
        slave_id=1,
        **kwargs,
    ) -> bool:
        from pymodbus.client import ModbusSerialClient

        self.slave_id = slave_id
        self.client = ModbusSerialClient(
            port=port,
            baudrate=baudrate,
            parity=parity,
            stopbits=stopbits,
            bytesize=bytesize,
        )
        self._connected = self.client.connect()
        return self._connected

    def disconnect(self):
        if self.client:
            self.client.close()
        self._connected = False

    def read_coils(self, address: int, count: int):
        if not self.client:
            return None
        return self.client.read_coils(
            address=address + self.COIL_OFFSET, count=count, slave=self.slave_id
        )

    def write_coil(self, address: int, value: bool):
        if not self.client:
            return None
        return self.client.write_coil(
            address=address + self.COIL_OFFSET, value=value, slave=self.slave_id
        )

    def is_connected(self) -> bool:
        return self._connected


class SLMPReadResult:
    def __init__(self, bits: Optional[List[bool]] = None, error: bool = False):
        self.bits = bits or []
        self._error = error

    def isError(self) -> bool:
        return self._error


class SLMPWriteResult:
    def __init__(self, error: bool = False):
        self._error = error

    def isError(self) -> bool:
        return self._error


class SLMPProtocol(PLCProtocol):
    def __init__(self):
        self.client = None
        self._connected = False

    def connect(
        self, ip="192.168.0.250", port=5000, plc_type="Q", comm_type="binary", **kwargs
    ) -> bool:
        import pymcprotocol

        self.client = pymcprotocol.Type3E(plctype=plc_type)
        if comm_type == "ascii":
            self.client.setaccessopt(commtype="ascii")
        try:
            self.client.connect(ip, int(port))
            self._connected = True
        except Exception:
            self._connected = False
        return self._connected

    def disconnect(self):
        if self.client and self._connected:
            try:
                self.client.close()
            except Exception:
                pass
        self._connected = False

    def read_coils(self, address: int, count: int):
        if not self.client or not self._connected:
            return SLMPReadResult(error=True)
        try:
            values = self.client.batchread_bitunits(
                headdevice=f"M{address}", readsize=count
            )
            return SLMPReadResult(bits=[bool(v) for v in values])
        except Exception:
            return SLMPReadResult(error=True)

    def write_coil(self, address: int, value: bool):
        if not self.client or not self._connected:
            return SLMPWriteResult(error=True)
        try:
            self.client.batchwrite_bitunits(
                headdevice=f"M{address}", values=[1 if value else 0]
            )
            return SLMPWriteResult()
        except Exception:
            return SLMPWriteResult(error=True)

    def is_connected(self) -> bool:
        return self._connected


class PLCService:
    def __init__(self):
        self._lock = threading.RLock()
        self.protocol: Optional[PLCProtocol] = None
        self.protocol_type: Optional[str] = None

    @property
    def connected(self) -> bool:
        return bool(self.protocol and self.protocol.is_connected())

    def status(self) -> dict:
        return {"connected": self.connected, "protocol_type": self.protocol_type}

    def connect(self, **params) -> dict:
        with self._lock:
            if self.connected:
                self.disconnect()

            protocol_type = str(params.get("protocol_type", "TCP")).upper()
            if protocol_type == "TCP":
                protocol: PLCProtocol = ModbusTCPProtocol()
            elif protocol_type == "RTU":
                protocol = ModbusRTUProtocol()
            elif protocol_type == "SLMP":
                protocol = SLMPProtocol()
            else:
                raise ValueError(f"Unsupported PLC protocol: {protocol_type}")

            tries = int(params.get("tries", 1))
            for _ in range(tries):
                if protocol.connect(**params):
                    self.protocol = protocol
                    self.protocol_type = protocol_type
                    return self.status()
                time.sleep(0.005)

            raise RuntimeError(f"Cannot connect PLC via {protocol_type}")

    def disconnect(self) -> dict:
        with self._lock:
            if self.protocol:
                self.protocol.disconnect()
            self.protocol = None
            self.protocol_type = None
            return self.status()

    def read_coils(self, address: int, count: int) -> dict:
        with self._lock:
            self._ensure_connected()
            result = self.protocol.read_coils(address, count)
            if result is None or result.isError():
                raise RuntimeError("PLC read failed")
            return {"success": True, "bits": [bool(v) for v in result.bits]}

    def read_machine_signals(self) -> dict:
        result = self.read_coils(address=0, count=3)
        bits = result["bits"]
        return {
            "success": True,
            "grab_image": bits[0],
            "machine_stop": bits[1],
            "machine_start": bits[2],
            "raw": bits,
        }

    def write_coil(self, address: int, value: bool) -> dict:
        with self._lock:
            self._ensure_connected()
            result = self.protocol.write_coil(address, value)
            if result is None or result.isError():
                raise RuntimeError("PLC write failed")
            return {"success": True, "address": address, "value": value}

    def pulse_coil(self, address: int, value: bool = True, duration_ms: int = 500) -> dict:
        self.write_coil(address, value)
        timer = threading.Timer(
            duration_ms / 1000,
            lambda: self.write_coil(address, not value),
        )
        timer.daemon = True
        timer.start()
        return {"success": True, "address": address, "value": value, "duration_ms": duration_ms}

    def set_light(self, enabled: bool) -> dict:
        result = self.write_coil(address=100, value=enabled)
        return {"success": True, "light_enabled": enabled, "raw": result}

    def pulse_error(self, duration_ms: int = 500) -> dict:
        result = self.pulse_coil(address=101, value=True, duration_ms=duration_ms)
        return {"success": True, "error_pulsed": True, "raw": result}

    def _ensure_connected(self):
        if not self.connected:
            raise RuntimeError("PLC is not connected")
