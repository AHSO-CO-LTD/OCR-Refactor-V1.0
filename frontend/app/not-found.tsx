import { ErrorScreen } from "@/components/system/error-screen";

export default function NotFound() {
  return (
    <ErrorScreen
      code="404"
      titleKey="error.notFoundTitle"
      descriptionKey="error.notFoundDescription"
    />
  );
}
