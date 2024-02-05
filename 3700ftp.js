// Importing necessary modules
const net = require("net"); // Provides asynchronous network API for creating stream-based TCP servers or clients
const yargs = require("yargs"); // Easily parses arguments and handles command line arguments
const url = require("url"); // Parses URLs
const fs = require("fs"); // File system module for reading and writing files

// Parse command line arguments with yargs
const argv = yargs
  .usage("$0 <command> [options]") // Usage message
  .command("ls <url>", "List files in a directory", {}) // Command to list files in a directory
  .command("mkdir <url>", "Create a directory", {}) // Command to create a directory
  .command("rmdir <url>", "Remove a directory", {}) // Command to remove a directory
  .command("rm <url>", "Remove a file", {}) // Command to remove a file
  .command(
    "cp <source> <destination>", // Command to copy a file from source to destination
    "Copy a file from source to destination",
    {}
  )
  .command(
    "mv <source> <destination>", // Command to move a file from source to destination
    "Move a file from source to destination",
    {}
  )
  .help() // Adds help option to command line arguments
  .alias("h", "help").argv;

const command = argv._[0]; // Get the command from the command line arguments

// Establish FTP Connection by parsing the URL provided in the command line
function parseURL(ftpUrl) {
  const parsedUrl = new url.URL(ftpUrl);
  return {
    host: parsedUrl.hostname,
    port: parsedUrl.port || 21, // Default FTP port is 21
    user: parsedUrl.username || "anonymous", // Default username is 'anonymous'
    password: parsedUrl.password || "", // Default password is an empty string
    path: parsedUrl.pathname,
  };
}

// Basic FTP client setup
class FTPClient {
  constructor() {
    this.controlConnection = new net.Socket();
  }

  connect({ host, port = 21, user, password }, onReady) {
    this.controlConnection.connect(port, host, () => {
      console.log("Connected to FTP server");
      this.login(user, password, onReady);
    });

    this.controlConnection.on("data", (data) => {
      console.log("SERVER:", data.toString());
      // Handle server responses here
    });
  }

  login(user, password, onReady) {
    this.sendCommand(`USER ${user}`, (response) => {
      if (response.startsWith("331")) {
        // 331 User name okay, need password
        this.sendCommand(`PASS ${password}`, (response) => {
          if (response.startsWith("230")) {
            // 230 User logged in, proceed
            onReady();
          }
        });
      }
    });
  }

  sendCommand(command, callback) {
    this.controlConnection.write(`${command}\r\n`, () => {
      this.controlConnection.once("data", (data) => callback(data.toString()));
    });
  }

  list(path, callback) {
    // Send the PASV command to enter passive mode
    this.sendCommand("PASV", (pasvResponse) => {
      // Parse the response to get the IP address and port for the data connection
      const pasvData = pasvResponse.match(/\(([^)]+)\)/)[1].split(",");
      const dataHost = pasvData.slice(0, 4).join(".");
      const dataPort =
        parseInt(pasvData[4], 10) * 256 + parseInt(pasvData[5], 10);

      // Establish a data connection on the provided port
      const dataConnection = new net.Socket();
      dataConnection.connect(dataPort, dataHost, () => {
        // Once connected, send the LIST command over the control connection
        this.sendCommand(`LIST ${path}`, () => {
          // Ready to receive directory listing over the data connection
        });
      });

      dataConnection.on("data", (data) => {
        console.log("Directory listing:\n", data.toString());
        // Close data connection once the listing is received
        dataConnection.end();
      });

      dataConnection.on("end", () => {
        callback(null, "Listing completed.");
      });

      dataConnection.on("error", (err) => {
        console.error("Data connection error:", err.message);
        callback(err);
      });
    });
  }

  mkdir(path, callback) {
    this.sendCommand(`MKD ${path}`, (response) => {
      if (response.startsWith("257")) {
        callback(null, "Directory created successfully.");
      } else {
        callback(new Error("Failed to create directory."));
      }
    });
  }

  rmdir(path, callback) {
    this.sendCommand(`RMD ${path}`, (response) => {
      if (response.startsWith("250")) {
        callback(null, "Directory removed successfully.");
      } else {
        callback(new Error("Failed to remove directory."));
      }
    });
  }

  rm(path, callback) {
    this.sendCommand(`DELE ${path}`, (response) => {
      if (response.startsWith("250")) {
        callback(null, "File removed successfully.");
      } else {
        callback(new Error("Failed to remove file."));
      }
    });
  }

  // In your FTPClient class:

  // Helper function to enter passive mode
  _enterPassiveMode(callback) {
    this.sendCommand("PASV", (response) => {
      // Look for the 'Entering Passive Mode' response code and message
      const pasvRegex =
        /227 Entering Passive Mode \((\d+,\d+,\d+,\d+),(\d+),(\d+)\)/;
      const result = pasvRegex.exec(response);

      if (!result) {
        callback(new Error("Failed to enter passive mode."));
        return;
      }

      // Parse the IP address and port number for the data connection
      const ipAddress = result[1].replace(/,/g, ".");
      const portNumber =
        parseInt(result[2], 10) * 256 + parseInt(result[3], 10);

      // Establish a new socket connection for the data transfer
      const dataConnection = new net.Socket();
      dataConnection.on("connect", () => {
        callback(null, dataConnection);
      });
      dataConnection.on("error", (err) => {
        callback(err);
      });

      // Connect using the extracted IP address and port number
      dataConnection.connect(portNumber, ipAddress);
    });
  }

  // Helper function to download a file
  _downloadFile(remotePath, localPath, callback) {
    // First, enter passive mode to get the data connection details
    this._enterPassiveMode((err, dataSocket) => {
      if (err) {
        callback(err);
        return;
      }

      // Listen for the data connection to be ready to receive the file
      dataSocket.on("data", (chunk) => {
        fs.appendFileSync(localPath, chunk);
      });

      dataSocket.on("end", () => {
        console.log("File download completed.");
        callback(null);
      });

      dataSocket.on("error", (err) => {
        console.error("Error during file download:", err.message);
        callback(err);
      });

      // Inform the server to start the transfer
      this.sendCommand(`RETR ${remotePath}`, (response) => {
        // Parse the response for an FTP status code
        const match = response.match(/^(\d{3})/);
        if (match) {
          const statusCode = parseInt(match[1], 10);

          // Check if the status code indicates that the server is about to send the file
          if (statusCode === 150) {
            console.log("Starting file download...");
            // The data will start flowing through the dataSocket.
          } else {
            // If the status code is not 150, something went wrong.
            callback(
              new Error(`Server responded with status code ${statusCode}`)
            );
          }
        } else {
          // If there's no match, the server's response was not recognized
          callback(new Error("Unrecognized response from server"));
        }
      });
    });
  }

  // Helper function to upload a file
  _uploadFile(localPath, remotePath, callback) {
    // First, enter passive mode to get the data connection details
    this._enterPassiveMode((err, dataSocket) => {
      if (err) {
        callback(err);
        return;
      }

      // Inform the server to start the transfer
      this.sendCommand(`STOR ${remotePath}`, (response) => {
        // The server should respond with a 150 status code if the file is okay to be sent
        const match = response.match(/^150/);
        if (match) {
          // Start sending the file data through the data connection
          const readStream = fs.createReadStream(localPath);

          readStream.on("data", (chunk) => {
            dataSocket.write(chunk);
          });

          readStream.on("end", () => {
            dataSocket.end();
          });

          readStream.on("error", (err) => {
            dataSocket.destroy();
            callback(err);
          });

          dataSocket.on("close", (hadError) => {
            if (!hadError) {
              console.log("File upload completed.");
              callback(null);
            }
          });

          dataSocket.on("error", (err) => {
            console.error("Data connection error:", err.message);
            callback(err);
          });
        } else {
          // If the status code is not 150, something went wrong
          callback(new Error("Failed to start file upload."));
        }
      });
    });
  }

  cp(source, destination, callback) {
    if (this._isRemotePath(source) && !this._isRemotePath(destination)) {
      // If the source is remote and the destination is local, download the file
      this.downloadFile(source, destination, callback);
    } else if (!this._isRemotePath(source) && this._isRemotePath(destination)) {
      // If the source is local and the destination is remote, upload the file
      this.uploadFile(source, destination, callback);
    } else {
      // This case should not happen based on your requirements
      callback(new Error("Invalid source and destination paths."));
    }
  }

  mv(source, destination, callback) {
    this.cp(source, destination, (err) => {
      if (err) {
        return callback(err);
      }

      // If the source file is remote, delete it after copying
      if (this._isRemotePath(source)) {
        this.rm(source, callback);
      } else {
        // If the source file is local, delete the local file
        fs.unlink(source, callback);
      }
    });
  }

  // Utility function to check if a path is remote
  _isRemotePath(path) {
    return path.startsWith("ftp://");
  }
}
