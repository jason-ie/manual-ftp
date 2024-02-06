# FTP Client Project

This project involves developing a custom FTP client in Node.js, designed to perform basic file operations like listing directories, creating and removing directories, and uploading/downloading files without leveraging any third-party FTP libraries. This constraint significantly increased the project's complexity, requiring a deep dive into the FTP protocol and manual implementation of its command sequences for establishing control and data connections. I previously completed this project with the use of remote npm libraries like "ftp" but used this version as a manual way to connect to an FTP server. 

## Challenges

**Manual Implementation without npm FTP Library**
Implementing the FTP client from scratch required a manual approach to handle TCP connections, send FTP commands, and parse server responses. This process involved:

- Establishing control and data connections using the net module.
- Sending raw FTP commands (e.g., LIST, MKD, RMD, DELE, RETR, STOR) to perform operations.
- Parsing server responses, especially for the PASV command to handle data connections correctly.

**Handling the mv Command**
The mv command posed a specific challenge as it required integrating both copy (cp) and delete (rm) functionalities. This process became complicated when dealing with:

- Remote-to-local and local-to-remote file moves, each requiring different handling and sequencing of operations.
- Ensuring that the source file is only deleted after a successful copy operation, which required careful management of asynchronous operations to avoid premature deletion.

## Testing Overview

Testing focused on verifying the correct implementation of FTP operations across various scenarios:

- Unit Testing: Mocking server responses to validate command parsing and response handling.
- Integration Testing: Interacting with a test FTP server to confirm the correct execution of file operations and error management.
- Manual Testing: Conducting real-world file operations to ensure reliability and stability under typical use cases.

MacOS offers the perk of already having a base url for the local machine and being able to visually see where files were, and what moves were taking place through the use of Finder's connect command was extremely helpful.

## Conclusion

This project demonstrated the intricacies of implementing an FTP client without high-level libraries, highlighting the importance of understanding underlying protocols and the challenges of managing asynchronous operations in Node.js. The manual implementation offered valuable insights into network programming, FTP protocol specifics, and error handling in a real-world application context.
