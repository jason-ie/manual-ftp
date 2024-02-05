# FTP Client Project

This project involves developing a custom FTP client in Node.js, designed to perform basic file operations like listing directories, creating and removing directories, and uploading/downloading files without leveraging any third-party FTP libraries. This constraint significantly increased the project's complexity, requiring a deep dive into the FTP protocol and manual implementation of its command sequences for establishing control and data connections.

## Challenges

- FTP Protocol Implementation: Understanding and manually implementing the FTP protocol's nuances was a key challenge, given the project's restriction against using specialized FTP libraries.
- Connection Handling: Developing robust logic for handling control and data connections, including entering passive mode and parsing server responses.
- Error Handling: Ensuring comprehensive error handling to gracefully manage connection issues, file transfer failures, and unexpected server responses.

## Testing Overview

Testing focused on verifying the correct implementation of FTP operations across various scenarios:

- Unit Testing: Mocking server responses to validate command parsing and response handling.
- Integration Testing: Interacting with a test FTP server to confirm the correct execution of file operations and error management.
- Manual Testing: Conducting real-world file operations to ensure reliability and stability under typical use cases.
