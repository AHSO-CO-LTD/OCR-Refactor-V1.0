import type { CameraFrame, ProductProfile } from "@/lib/api";

export type RoiCropImage = {
  slotIndex: number;
  imageBase64: string;
};

export function readImageFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function cameraFrameToDataUrl(frame: CameraFrame) {
  const mimeType =
    frame.encode_format === ".png" || frame.encode_format === "png"
      ? "image/png"
      : "image/jpeg";

  return frame.image_base64.startsWith("data:image/")
    ? frame.image_base64
    : `data:${mimeType};base64,${frame.image_base64}`;
}

export async function cropProductRois(
  imageBase64: string,
  product: ProductProfile,
): Promise<RoiCropImage[]> {
  const image = await loadImage(imageBase64);
  const rotateCanvas = document.createElement("canvas");
  const rotateContext = rotateCanvas.getContext("2d");

  if (!rotateContext) {
    throw new Error("Cannot create image crop context");
  }

  const configuredWidth = Math.max(
    1,
    product.camera.imageWidth || image.naturalWidth,
  );
  const configuredHeight = Math.max(
    1,
    product.camera.imageHeight || image.naturalHeight,
  );
  const imageMapping = getContainedImageMapping({
    frameWidth: configuredWidth,
    frameHeight: configuredHeight,
    imageWidth: image.naturalWidth,
    imageHeight: image.naturalHeight,
  });

  return product.roiRegions.map((region) => {
    const sourceCenterX =
      (region.x - imageMapping.offsetX) * imageMapping.scaleX;
    const sourceCenterY =
      (region.y - imageMapping.offsetY) * imageMapping.scaleY;
    const sourceWidth = Math.max(
      1,
      Math.round(region.width * imageMapping.scaleX),
    );
    const sourceHeight = Math.max(
      1,
      Math.round(region.height * imageMapping.scaleY),
    );
    const sourceTopLeftX = sourceCenterX - sourceWidth / 2;
    const sourceTopLeftY = sourceCenterY - sourceHeight / 2;
    const normalizedRegionRotation =
      ((Math.round(Number(region.rotation) / 90) * 90) % 360 + 360) % 360;
    const rotationSteps = product.rotateTestImageClockwise
      ? 1
      : normalizedRegionRotation / 90;
    const normalizedRotationSteps = ((rotationSteps % 4) + 4) % 4;
    const cropCanvas = document.createElement("canvas");
    const cropContext = cropCanvas.getContext("2d");

    if (!cropContext) {
      throw new Error("Cannot create ROI crop context");
    }

    cropCanvas.width = sourceWidth;
    cropCanvas.height = sourceHeight;
    cropContext.drawImage(image, -sourceTopLeftX, -sourceTopLeftY);

    const rotatedWidth =
      normalizedRotationSteps % 2 === 1 ? cropCanvas.height : cropCanvas.width;
    const rotatedHeight =
      normalizedRotationSteps % 2 === 1 ? cropCanvas.width : cropCanvas.height;
    rotateCanvas.width = rotatedWidth;
    rotateCanvas.height = rotatedHeight;
    rotateContext.clearRect(0, 0, rotateCanvas.width, rotateCanvas.height);
    rotateContext.save();
    rotateContext.translate(rotateCanvas.width / 2, rotateCanvas.height / 2);
    rotateContext.rotate((normalizedRotationSteps * Math.PI) / 2);
    rotateContext.drawImage(
      cropCanvas,
      -cropCanvas.width / 2,
      -cropCanvas.height / 2,
      cropCanvas.width,
      cropCanvas.height,
    );
    rotateContext.restore();

    return {
      slotIndex: region.index,
      imageBase64: rotateCanvas.toDataURL("image/jpeg", 0.88),
    };
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Cannot load selected image"));
    image.src = src;
  });
}

function getContainedImageMapping({
  frameHeight,
  frameWidth,
  imageHeight,
  imageWidth,
}: {
  frameHeight: number;
  frameWidth: number;
  imageHeight: number;
  imageWidth: number;
}) {
  const containScale = Math.min(
    frameWidth / imageWidth,
    frameHeight / imageHeight,
  );
  const displayedWidth = imageWidth * containScale;
  const displayedHeight = imageHeight * containScale;

  return {
    offsetX: (frameWidth - displayedWidth) / 2,
    offsetY: (frameHeight - displayedHeight) / 2,
    scaleX: imageWidth / displayedWidth,
    scaleY: imageHeight / displayedHeight,
  };
}
