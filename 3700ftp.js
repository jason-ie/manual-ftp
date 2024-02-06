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
    host: parsedUrl.hostname, // Hostname of the FTP server
    port: parsedUrl.port || 21, // Default FTP port is 21
    user: parsedUrl.username || "anonymous", // Default username is 'anonymous'
    password: parsedUrl.password || "", // Default password is an empty string
    path: parsedUrl.pathname, // Path of the file or directory
  };
}

/*
Function to log in to the FTP server
initiates a login process to an FTP server. It takes an FTP client object, user credentials, and a callback function as arguments. 
The function sends the username and password to the server, listens for server responses, and calls the callback function when the login 
process is completed or if an error occurs.
*/
function loginToFtp(client, { user, password }, callback) {
  let loginSequence = [
    `USER ${user}\r\n`, // Send username
    `PASS ${password}\r\n`, // Send password
  ];

  let responseCount = 0;

  client.on("data", function (data) {
    console.log("Response: " + data.toString());
    responseCount++;

    // After receiving the welcome message, send login commands
    if (responseCount === 1) {
      client.write(loginSequence[0]);
    } else if (data.toString().startsWith("331")) {
      // 331 response code means user OK, password required
      client.write(loginSequence[1]);
    } else if (data.toString().startsWith("230")) {
      // 230 response code means logged in successfully
      callback(null); // Logged in successfully
    } else if (data.toString().startsWith("530")) {
      // 530 response code means login authentication failed
      callback(new Error("Login authentication failed"));
    }
  });

  client.on("error", function (err) {
    console.log("Connection error: " + err.message);
    callback(err);
  });
}

/* Function to establish a connection to the FTP server:
Takes an FTP URL and a callback function as arguments
It parses the URL, creates a TCP socket client, and attempts to connect to the FTP server
Once connected, it tries to log in; If the login is successful, it calls the callback with the client 
If it fails, it calls the callback with the error. It also handles any connection errors
*/
function connectToFtpServer(ftpUrl, callback) {
  // Parse the URL to extract FTP server details
  const { host, port, user, password } = parseURL(ftpUrl);

  // Create a new TCP socket client
  const client = new net.Socket();

  // Attempt to connect to the FTP server
  client.connect(port, host, () => {
    console.log(`Connected to FTP server: ${host}`);
    // Once connected, login to the FTP server
    loginToFtp(client, { user, password }, (loginError) => {
      if (loginError) {
        console.error("FTP Login failed:", loginError.message); // Log the login error
        callback(loginError, null);
      } else {
        console.log("FTP Login successful");
        callback(null, client); // Pass the connected and logged-in client to the callback
      }
    });
  });

  // Handle connection errors
  client.on("error", (err) => {
    console.log("FTP Connection error:", err.message);
    callback(err, null);
  });
}

/* Function to open a data connection and parse the response for PASV command:
Initiates a passive FTP data connection
Sends the "PASV" command to the server, then listens for a response
If the response starts with "227", it extracts the IP address and port from the response, and runs the callback
Else, it calls the callback with an error.
*/
function openDataConnection(client, callback) {
  client.write("PASV\r\n"); // Send the PASV command to the server
  client.once("data", function (data) {
    // Listen for the server's response
    const response = data.toString(); // Convert the response data to a string
    console.log("PASV Response: ", response);
    if (response.startsWith("227")) {
      const ipAndPort = response.match(/\(([^)]+)\)/)[1].split(","); // Extract the IP and port from the response
      const ip = ipAndPort.slice(0, 4).join("."); // Join the first 4 elements of the array to form the IP address
      const port = (parseInt(ipAndPort[4]) << 8) + parseInt(ipAndPort[5]);
      callback(null, { ip, port });
    } else {
      callback(new Error("Failed to enter passive mode")); // Call the callback with an error
    }
  });
}

/* Implements the ls command:
Connects to an FTP server, opens a data connection, and sends a LIST command to retrieve directory listing
Accumulates the received data and logs it when the data transmission ends
If any step fails, logs the error and stops further execution
*/
function handleLsCommand(ftpUrl) {
  connectToFtpServer(ftpUrl, function (error, client) {
    // Connect to the FTP server
    if (error) {
      console.error("Failed to connect or log in:", error.message); // Log the error
      return;
    }
    openDataConnection(client, function (error, { ip, port }) {
      // Open a data connection
      // Open a data connection
      if (error) {
        console.error("Failed to open data connection:", error.message); // Log the error
        return;
      }
      const dataClient = new net.Socket(); // Create a new socket for the data connection
      dataClient.connect(port, ip, function () {
        // Connect to the data port
        console.log("Data connection established for LIST command"); // Log the data connection establishment
        client.write(`LIST ${parseURL(ftpUrl).path}\r\n`); // Send the LIST command
      });

      let listingData = "";
      dataClient.on("data", function (data) {
        // Accumulate the received data
        listingData += data.toString(); // Append the received data to the listingData string
      });

      dataClient.on("end", function () {
        // Log the directory listing when the data transmission ends
        console.log("Directory listing:\n", listingData);
        client.end();
      });
    });
  });
}

/* Implements mkdir command:
Connects to an FTP server and sends a MKD command to create a new directory
Parses the FTP URL to get the path for the new directory
If the connection or directory creation fails, logs the error
Else, logs the server's response and then ends the connection
*/
function handleMkdirCommand(ftpUrl) {
  connectToFtpServer(ftpUrl, function (error, client) {
    // Connect to the FTP server
    if (error) {
      console.error("Failed to connect or log in:", error.message); // Log the error
      return;
    }
    const { path } = parseURL(ftpUrl); // Parse the URL to get the path
    client.write(`MKD ${path}\r\n`); // Send the MKD command

    client.once("data", function (data) {
      // Listen for the server's response
      console.log("MKD Response: ", data.toString()); // Log the server's response
      client.end();
    });
  });
}

/* Implements rmdir command:
 Connects to an FTP server and sends an RMD command to remove a directory
 Parses the FTP URL to get the path of the directory
 If the connection fails, it logs the error
 Else logs the server's response and then ends the connection.
*/
function handleRmdirCommand(ftpUrl) {
  connectToFtpServer(ftpUrl, function (error, client) {
    // Connect to the FTP server
    if (error) {
      console.error("Failed to connect or log in:", error.message); // Log the error
      return;
    }
    const { path } = parseURL(ftpUrl); // Parse the URL to get the path
    client.write(`RMD ${path}\r\n`); // Send the RMD command

    client.once("data", function (data) {
      // Listen for the server's response
      console.log("RMD Response: ", data.toString()); // Log the server's response
      client.end();
    });
  });
}

/* Implements rm command:
Connects to an FTP server and sends a DELE command to delete a file
Parses the FTP URL to get the file path
If the connection fails, it logs the error
If the deletion is successful, it logs a success message
Else, logs an error and calls the callback with an error; Ends connection in all cases
*/
function handleRmCommand(ftpUrl, callback) {
  connectToFtpServer(ftpUrl, function (error, client) {
    // Connect to the FTP server
    if (error) {
      console.error("Failed to connect or log in for deletion:", error); // Log the error
      callback(error);
    } else {
      const { path } = parseURL(ftpUrl); // Parse the URL to get the file path
      client.write(`DELE ${path}\r\n`); // Send the DELE command
      client.once("data", function (data) {
        // Listen for the server's response
        if (data.toString().startsWith("250")) {
          // 250 response code means file deleted successfully
          console.log("File deleted successfully."); // Log the success message
          if (typeof callback === "function") {
            // Check if the callback is a function
            callback(null);
          }
        } else {
          console.error("Failed to delete file:", data.toString()); // Log the error
          if (typeof callback === "function") {
            // Check if the callback is a function
            callback(new Error("Failed to delete file"));
          }
        }
        client.end();
      });
    }
  });
}

/* Function to download a file from remote FTP to local:
 Connects to an FTP server, opens a data connection, sends a RETR command to download a file
 Writes the received data to a local file
 If any step fails, it logs the error and stops further execution
 Wen the file download is complete, it calls a callback function with the remote URL.
*/
function downloadFileFromFtp(remoteUrl, localPath, callback) {
  connectToFtpServer(remoteUrl, function (error, client) {
    // Connect to the FTP server
    if (error) {
      console.error("Failed to connect or log in:", error.message); // Log the error
      return;
    }

    openDataConnection(client, function (error, { ip, port }) {
      // Open a data connection
      if (error) {
        console.error("Failed to open data connection:", error.message); // Log the error
        client.end(); // Close control connection
        return;
      }

      const dataClient = new net.Socket(); // Create a new socket for the data connection

      dataClient.connect(port, ip, function () {
        // Connect to the data port
        console.log("Data connection established for RETR command"); // Log the data connection establishment
        client.write(`RETR ${parseURL(remoteUrl).path}\r\n`); // Send the RETR command
      });

      // Open a file stream to write the downloaded data
      const fileStream = fs.createWriteStream(localPath);
      dataClient.on("data", function (data) {
        // Write the received data to the file
        // console.log("Receiving data...");
        fileStream.write(data); // Write the received data to the file
      });

      dataClient.on("end", function () {
        // When the data transmission ends
        console.log("File download completed.");
        fileStream.end(); // Close the file stream
        client.end(); // Close control connection
        if (callback) {
          callback(remoteUrl);
        }
      });

      client.once("data", function (response) {
        // Listen for the server's response
        console.log("RETR Response: ", response.toString());
        // Handle server response to the RETR command
        if (!response.toString().startsWith("150")) {
          // 150 response code means file status okay; about to open data connection
          console.error("Failed to start file transfer.");
          fileStream.end(); // Ensure file stream is closed on error
          dataClient.end(); // Close data connection on error
        }
      });
    });
  });
}

/* Function to upload a file from local to remote FTP:
Connects to an FTP server, opens a data connection, sends a STOR command to upload a local file to the server, closes the connection
If any step fails, it logs the error and stops further execution
When the file upload is complete, it calls a callback function with the local file path
*/
function uploadFileToFtp(localPath, remoteUrl, callback) {
  connectToFtpServer(remoteUrl, function (error, client) {
    // Connect to the FTP server
    if (error) {
      console.error("Failed to connect or log in:", error.message); // Log the error
      return;
    }

    openDataConnection(client, function (error, { ip, port }) {
      // Open a data connection
      if (error) {
        console.error("Failed to open data connection:", error.message); // Log the error
        client.end(); // Close control connection
        return;
      }

      const dataClient = new net.Socket(); // Create a new socket for the data connection

      // Once the data connection is established, send the STOR command
      dataClient.connect(port, ip, function () {
        console.log("Data connection established for STOR command"); // Log the data connection establishment
        client.write(`STOR ${parseURL(remoteUrl).path}\r\n`); // Send the STOR command
      });

      // Handle the server's response to the STOR command
      client.once("data", function (response) {
        console.log("STOR Response: ", response.toString()); // Log the server's response
        if (response.toString().startsWith("150")) {
          // Server is ready to receive the file data
          fs.createReadStream(localPath)
            .pipe(dataClient) // Pipe the file stream to the data connection
            .on("finish", function () {
              // When the file upload is complete
              console.log("File upload completed.");
              client.end(); // Close control connection after the upload is complete
              if (callback) {
                callback(localPath);
              }
            });
        } else {
          console.error("Failed to start file transfer.");
          dataClient.end(); // Close data connection on error
        }
      });
    });
  });
}

/* Implements cp command:
Checks the source and destination URLs
If the source is local and the destination is an FTP server, it uploads the file
If the source is an FTP server and the destination is local, it downloads the file
If neither condition is met, it logs an error message
*/
function handleCpCommand(source, destination, callback) {
  // Upload file from local to remote FTP
  if (!source.startsWith("ftp://") && destination.startsWith("ftp://")) {
    uploadFileToFtp(source, destination, callback);
  }
  // Download file from remote FTP to local
  else if (source.startsWith("ftp://") && !destination.startsWith("ftp://")) {
    downloadFileFromFtp(source, destination, callback);
  } else {
    console.error(
      "Copy command currently supports only local-to-remote or remote-to-local copying."
    );
  }
}

/* Implements mv command:
Moves a file from a source to a destination
If the source is an FTP server and the destination is local, it downloads the file and then deletes it from the server
If the source is local and the destination is an FTP server, it uploads the file and then deletes it locally
If neither condition is met, it logs an error message
*/
function handleMvCommand(source, destination) {
  if (source.startsWith("ftp://") && !destination.startsWith("ftp://")) {
    // Moving from remote to local
    downloadFileFromFtp(source, destination, (downloadError) => {
      // Download the file from the remote source
      if (downloadError) {
        console.error("Failed to download the file:", downloadError); // Log the download error
      } else {
        console.log("File downloaded successfully."); // Log the successful download
        // Proceed to delete the remote source file
        const { path } = parseURL(source);
        handleRmCommand(`ftp://${path}`, (deleteError) => {
          // Delete the remote source file
          if (deleteError) {
            console.error(
              "Failed to delete the remote source file:", // Log the delete error
              deleteError
            );
          } else {
            console.log("Remote source file deleted successfully."); // Log the successful delete
          }
        });
      }
    });
  } else if (!source.startsWith("ftp://") && destination.startsWith("ftp://")) {
    // Moving from local to remote
    uploadFileToFtp(source, destination, (uploadError) => {
      // Upload the file to the remote destination
      if (uploadError) {
        console.error("Failed to upload the file:", uploadError); // Log the upload error
      } else {
        console.log("File uploaded successfully."); // Log the successful upload
        // Proceed to delete the local source file
        fs.unlink(source, (unlinkError) => {
          if (unlinkError) {
            console.error(
              "Failed to delete the local source file:",
              unlinkError // Log the delete error
            );
          } else {
            console.log("Local source file deleted successfully."); // Log the successful delete
          }
        });
      }
    });
  } else {
    console.error("Move operation not supported between specified locations."); // Log the error
  }
}

/* Function to handle the command specified in the command line arguments:
Handles different FTP commands
Depending on the command, it calls a different function with the appropriate arguments
If the command is not recognized, it logs "Unknown command"
*/
switch (command) {
  case "ls":
    handleLsCommand(argv.url);
    break;
  case "mkdir":
    handleMkdirCommand(argv.url);
    break;
  case "rmdir":
    handleRmdirCommand(argv.url);
    break;
  case "rm":
    handleRmCommand(argv.url);
    break;
  case "cp":
    handleCpCommand(argv.source, argv.destination);
    break;
  case "mv":
    handleMvCommand(argv.source, argv.destination);
    break;
  default:
    console.log("Unknown command");
    break;
}
