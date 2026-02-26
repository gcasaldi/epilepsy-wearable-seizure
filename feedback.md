# User Feedback and Security Concerns

## 1. Bluetooth Device Identification

**Issue:** When connecting to a device via Bluetooth, the UI displays the device's IP address. This is not user-friendly.

**Suggestion:** Display the human-readable device name instead of the IP address to make device selection easier and more intuitive.

## 2. Lack of User Authentication

**Issue:** The application does not currently require user authentication (login credentials). This is a significant security risk, as it allows unauthorized access.

**Suggestion:** Implement a robust authentication mechanism. Even if the app is distributed through trusted stores like the Play Store, requiring users to log in is a fundamental security best practice. This aligns with the security principles outlined in `docs/security-account-lifecycle.md`, such as strong authentication.
