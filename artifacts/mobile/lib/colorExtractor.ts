import { Platform } from "react-native";

export function extractDominantColor(
  imageUrl: string,
  callback: (color: string) => void
) {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    callback("#C2185B");
    return;
  }

  const img = new window.Image();
  img.crossOrigin = "Anonymous";
  img.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 8;
      canvas.height = 8;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        callback("#C2185B");
        return;
      }
      ctx.drawImage(img, 0, 0, 8, 8);
      const data = ctx.getImageData(0, 0, 8, 8).data;
      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
      }
      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);
      callback(`rgb(${r},${g},${b})`);
    } catch {
      callback("#C2185B");
    }
  };
  img.onerror = () => callback("#C2185B");
  img.src = imageUrl;
}
