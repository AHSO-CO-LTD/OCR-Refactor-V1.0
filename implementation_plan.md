# Fix: ROI tren preview khong khop voi anh crop thuc te

## Mo ta van de

Nguoi dung ve ROI tren preview voi `(x, y)` la **toa do tam** va `rotation` tu do (do).
Pipeline crop/OCR o ca frontend lan Python tool dang dung sai convention, dan den anh crop lech hoac bi cat sai vung.

---

## Bug #1 — Frontend crop: `drawImage` lech dung mot nua kich thuoc ROI

### File bi loi
[line-test-panel.tsx](file:///c:/duyhai/AHSO/OCR/OCR-Metal-Core-Washing-Refactor/frontend/components/operator/line-test-panel.tsx#L740-L747)

### Code hien tai (sai)

```ts
// L740-L747
cropContext.translate(cropCanvas.width / 2, cropCanvas.height / 2);
cropContext.rotate(-degreesToRadians(region.rotation));
cropContext.drawImage(image, -sourceCenterX, -sourceCenterY);
//                           ^^^^^^^^^^^^^ SAI
```

### Tai sao sai

- `region.x`, `region.y` la **toa do tam** cua ROI (editor L565-568: `left = (region.x - region.width/2) / cameraWidth * 100%`).
- `sourceCenterX = region.x * scaleX` la vi tri **tam ROI** tren anh goc.
- De tam ROI roi dung vao tam canvas: can dich anh sao cho pixel `(sourceCenterX, sourceCenterY)` nam o goc toa do `(0, 0)` sau `translate`.
- `drawImage(image, -sourceCenterX, -sourceCenterY)` dat **goc tren-trai cua anh** tai `(-sourceCenterX, -sourceCenterY)` — khong phai dat tam ROI vao tam canvas.
- Ket qua: canvas bi dich lech chinh xac `(sourceWidth/2, sourceHeight/2)` so voi dung.

### Cach sua

```ts
cropContext.translate(cropCanvas.width / 2, cropCanvas.height / 2);
cropContext.rotate(-degreesToRadians(region.rotation));
cropContext.drawImage(
  image,
  -(sourceCenterX - sourceWidth / 2),   // dat tam ROI vao (0,0) trong khong gian da translate
  -(sourceCenterY - sourceHeight / 2),
);
```

### Tai sao sua vay dung

Sau `translate(w/2, h/2)`, goc toa do canvas nam o tam canvas.
`drawImage` tai `(-(cx - w/2), -(cy - h/2))` khien pixel `(cx, cy)` cua anh goc roi dung vao `(0,0)` = tam canvas = tam ROI.

---

## Bug #2 — Backend gui `x,y` la tam nhung Tool Python hieu la goc tren-trai

### File bi loi — Backend gui

[device-tool.service.ts L496-L503](file:///c:/duyhai/AHSO/OCR/OCR-Metal-Core-Washing-Refactor/backend/src/device-tool/device-tool.service.ts#L496-L503)

```ts
roi_list: request.roiRegions.map((region) => ({
  label: `slot-${region.index}`,
  x: region.x,        // SAI: day la TAM ROI
  y: region.y,        // SAI: day la TAM ROI
  width: region.width,
  height: region.height,
  rotate_clockwise: this.shouldRotateClockwise(region.rotation),
})),
```

### File bi loi — Tool Python nhan

[yolo_ocr_router.py L204-L225](file:///c:/duyhai/AHSO/OCR/OCR-Metal-Core-Washing-Refactor/tool/api/routers/yolo_ocr_router.py#L204-L225)

```python
# Tool hieu x, y la GOC TREN-TRAI
x0 = max(0, roi.x)
y0 = max(0, roi.y)
x1 = min(image_width, roi.x + roi.width)
y1 = min(image_height, roi.y + roi.height)
crop = image[y0:y1, x0:x1]
```

### Tai sao sai

- Backend gui `x = region.x` (tam), `y = region.y` (tam).
- Tool Python dung `x` nhu goc tren-trai: crop tu `(roi.x, roi.y)` den `(roi.x+w, roi.y+h)`.
- Dung phai crop tu `(cx - w/2, cy - h/2)` den `(cx + w/2, cy + h/2)`.
- Ket qua: crop bi lech phai/xuong mot nua kich thuoc ROI — **cung sai lech voi Bug 1 nhung doc lap**.

### Cach sua — Backend convert truoc khi gui

```ts
// device-tool.service.ts - inspectRoiImage()
roi_list: request.roiRegions.map((region) => ({
  label: `slot-${region.index}`,
  x: Math.max(0, Math.round(region.x - region.width / 2)),   // convert tam -> goc tren-trai
  y: Math.max(0, Math.round(region.y - region.height / 2)),  // convert tam -> goc tren-trai
  width: region.width,
  height: region.height,
  rotate_clockwise: this.shouldRotateClockwise(region.rotation),
})),
```

> **Ghi chu:** Khong sua Tool Python de giu API on dinh (goc tren-trai la convention chuan cua CV).
> Backend da lam dung o `startCameraOcr` L418-L423 — do la pattern can copy sang `inspectRoiImage`.

---

## Bug #3 — Rotation tu do bi ha cap ve boolean `rotate_clockwise`

### File bi loi

[device-tool.service.ts L513-L516](file:///c:/duyhai/AHSO/OCR/OCR-Metal-Core-Washing-Refactor/backend/src/device-tool/device-tool.service.ts#L513-L516)

```ts
private shouldRotateClockwise(rotation: number) {
  const normalized = ((rotation % 180) + 180) % 180;
  return normalized >= 45 && normalized < 135;
}
```

[yolo_ocr_router.py L226-L227](file:///c:/duyhai/AHSO/OCR/OCR-Metal-Core-Washing-Refactor/tool/api/routers/yolo_ocr_router.py#L226-L227)

```python
if roi.rotate_clockwise:
    crop = cv2.rotate(crop, cv2.ROTATE_90_CLOCKWISE)
```

### Tai sao sai

- Editor cho phep ve ROI voi **rotation tu do** tu -180 den 180 do: 15, 30, 45, 75, 120...
- Backend map toan bo range do ve 1 bit True/False (chi phan biet "ngang" hay "doc").
- Tool Python dung bit do de rotate crop 90 do co dinh — khong co gi khac.
- Moi ROI xoay o goc tu do (khong phai 0 hoac ~90 do) bi crop thang, bo qua rotation.
- Anh tool nhan duoc **khong trung** voi anh nguoi dung thay tren preview.

### Cach sua

**Buoc 1 — Tool Python: them field `rotation` vao `OCRRoiRequestItem`**

```python
# yolo_ocr_router.py
class OCRRoiRequestItem(BaseModel):
    label: Optional[str] = None
    x: int          # goc tren-trai (sau khi backend convert)
    y: int          # goc tren-trai (sau khi backend convert)
    width: int
    height: int
    rotation: float = 0.0           # THEM: goc do tu do (am/duong)
    rotate_clockwise: bool = False  # giu lai cho backward compat
```

**Buoc 2 — Tool Python: dung `warpAffine` crop theo rotation thuc**

```python
# Thay block crop thang hien tai trong endpoint /ocr/rois
# cx, cy la tam ROI (tinh tu x goc tren-trai sau khi backend da convert)
cx = roi.x + roi.width // 2
cy = roi.y + roi.height // 2

# Convention da xac nhan: region.rotation duong = clockwise (CSS Y-down)
# cv2.getRotationMatrix2D duong = clockwise tren anh thuc te (Y-down)
# -> Truyen thang, KHONG doi dau
M = cv2.getRotationMatrix2D((float(cx), float(cy)), float(roi.rotation), 1.0)
rotated_full = cv2.warpAffine(
    image, M, (image_width, image_height),
    flags=cv2.INTER_LINEAR,
    borderMode=cv2.BORDER_REPLICATE,
)

# Crop vung ROI thang sau khi da unrotate toan anh
x0 = max(0, roi.x)
y0 = max(0, roi.y)
x1 = min(image_width, roi.x + roi.width)
y1 = min(image_height, roi.y + roi.height)
crop = rotated_full[y0:y1, x0:x1]
```

**Buoc 3 — Backend: gui them `rotation` trong `roi_list`**

```ts
// device-tool.service.ts - inspectRoiImage()
roi_list: request.roiRegions.map((region) => ({
  label: `slot-${region.index}`,
  x: Math.max(0, Math.round(region.x - region.width / 2)),
  y: Math.max(0, Math.round(region.y - region.height / 2)),
  width: region.width,
  height: region.height,
  rotation: Number(region.rotation),        // THEM
  rotate_clockwise: this.shouldRotateClockwise(region.rotation),  // giu compat
})),
```

---

## Convention Rotation — Da xac nhan tu source code

| Diem kiem tra | File | Ket luan |
|---|---|---|
| Editor CSS render | `operator-roi-editor.tsx` L569: `rotate(${region.rotation}deg)` | CSS duong = **clockwise** |
| Editor `rotateVector` | L49-56: `x = cos*x - sin*y`, `y = sin*x + cos*y` | He Y-down -> duong = **clockwise** |
| Frontend crop unrotate | `line-test-panel.tsx` L745: `cropContext.rotate(-degreesToRadians(region.rotation))` | Dung am de undo -> khang dinh duong = clockwise |
| OpenCV thuc te | `cv2.getRotationMatrix2D(center, angle, scale)` | Tai lieu ghi CCW nhung tren anh Y-down -> duong = **clockwise** |

> **Ket luan: Hai he Y-down khop nhau hoan toan. Truyen `rotation` truc tiep, KHONG doi dau.**

---

## Tom tat thay doi theo file

### [MODIFY] [line-test-panel.tsx](file:///c:/duyhai/AHSO/OCR/OCR-Metal-Core-Washing-Refactor/frontend/components/operator/line-test-panel.tsx)
- Sua offset `drawImage` trong ham `cropProductRois` (L746): tu `(-sourceCenterX, -sourceCenterY)` thanh `(-(sourceCenterX - sourceWidth/2), -(sourceCenterY - sourceHeight/2))`.

### [MODIFY] [device-tool.service.ts](file:///c:/duyhai/AHSO/OCR/OCR-Metal-Core-Washing-Refactor/backend/src/device-tool/device-tool.service.ts)
- Sua `inspectRoiImage` (L496-L503): convert tam -> goc tren-trai truoc khi gui.
- Them field `rotation` vao `roi_list`.

### [MODIFY] [yolo_ocr_router.py](file:///c:/duyhai/AHSO/OCR/OCR-Metal-Core-Washing-Refactor/tool/api/routers/yolo_ocr_router.py)
- Them field `rotation: float = 0.0` vao `OCRRoiRequestItem`.
- Thay block crop thang bang `warpAffine` + crop (khong doi dau angle).

---

## Verification Plan

### Manual
1. Mo Line Test, chon san pham IS-35R, chup anh thuc hoac dung anh tu screenshot.
2. Transmit -> xem panel **ROI CROP**: tam ROI tren preview phai khop voi noi dung anh crop.
3. Test ROI co rotation khac 0: noi dung crop phai thang dung dung huong, khong bi lech.
4. Kiem tra ca flow camera live (inspectProduct): so sanh ROI overlay voi vung tool doc.

### Automated
```powershell
npm run lint -w @ocr/frontend
npm run lint -w @ocr/backend
npm run typecheck
```

> **Luu y:** Bug #1 va Bug #2 la doc lap — moi cai gay lech rieng.
> Ca hai phai sua cung luc vi chung co the bu tru nhau trong mot so truong hop.
