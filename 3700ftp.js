// Importing necessary modules
const net = require("net"); // Provides asynchronous network API for creating stream-based TCP servers or clients
const yargs = require("yargs"); // Easily parses arguments and handles command line arguments
const url = require("url"); // Parses URLs
const fs = require("fs"); // File system module for reading and writing files
const { log } = require("console");

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

// Function to log in to the FTP server
function loginToFtp(client, user, password, callback) {
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

  client.connect(port, host, function () {
    console.log(`Connected to FTP server: ${host}`);
  });

  client.on("error", function (err) {
    console.log("Connection error: " + err.message);
    callback(err);
  });
}

// Function to establish a connection to the FTP server
function connectToFtpServer(ftpUrl, callback) {
  const { host, port, user, password } = parseURL(ftpUrl);

  const client = new net.Socket();

  loginToFtp(client, user, password, callback);
}

// Function to open a data connection and parse the response for PASV command
function openDataConnection(client, callback) {
  client.write("PASV\r\n");

  client.once("data", function (data) {
    const response = data.toString();
    console.log("PASV Response: ", response);
    if (response.startsWith("227")) {
      const ipAndPort = response.match(/\(([^)]+)\)/)[1].split(",");
      const ip = ipAndPort.slice(0, 4).join(".");
      const port = (parseInt(ipAndPort[4]) << 8) + parseInt(ipAndPort[5]);
      callback(null, { ip, port });
    } else {
      callback(new Error("Failed to enter passive mode"));
    }
  });
}

// Implement the ls command
function handleLsCommand(ftpUrl) {
  connectToFtpServer(ftpUrl, function (error) {
    if (error) {
      console.error("Failed to connect or log in:", error.message);
      return;
    }

    openDataConnection(client, function (error, { ip, port }) {
      if (error) {
        console.error("Failed to open data connection:", error.message);
        return;
      }

      const dataClient = new net.Socket();
      dataClient.connect(port, ip, function () {
        console.log("Data connection established for LIST command");
        client.write(`LIST ${parseURL(ftpUrl).path}\r\n`);
      });

      dataClient.on("data", function (data) {
        console.log("Directory listing:\n", data.toString());
        dataClient.end();
      });

      dataClient.on("end", function () {
        console.log("Data connection closed");
        client.end();
      });
    });
  });
}

// Implement mkdir command
function handleMkdirCommand(ftpUrl) {
  connectToFtpServer(ftpUrl, function (error, client) {
    if (error) {
      console.error("Failed to connect or log in:", error.message);
      return;
    }

    client.write(`MKD ${parseURL(ftpUrl).path}\r\n`);

    client.once("data", function (data) {
      console.log("MKD Response: ", data.toString());
      client.end();
    });
  });
}

// Implement rmdir command
function handleRmdirCommand(ftpUrl) {
  connectToFtpServer(ftpUrl, function (error, client) {
    if (error) {
      console.error("Failed to connect or log in:", error.message);
      return;
    }

    client.write(`RMD ${parseURL(ftpUrl).path}\r\n`);

    client.once("data", function (data) {
      console.log("RMD Response: ", data.toString());
      client.end();
    });
  });
}

// Implement rm command
function handleRmCommand(ftpUrl) {
  connectToFtpServer(ftpUrl, function (error, client) {
    if (error) {
      console.error("Failed to connect or log in:", error.message);
      return;
    }

    client.write(`DELE ${parseURL(ftpUrl).path}\r\n`);

    client.once("data", function (data) {
      console.log("DELE Response: ", data.toString());
      client.end();
    });
  });
}

// Function to download a file from remote FTP to local
function downloadFileFromFtp(remoteUrl, localPath) {
  connectToFtpServer(remoteUrl, function (error, client) {
    if (error) {
      console.error("Failed to connect or log in:", error.message);
      return;
    }

    openDataConnection(client, function (error, { ip, port }) {
      if (error) {
        console.error("Failed to open data connection:", error.message);
        client.end(); // Close control connection
        return;
      }

      const dataClient = new net.Socket();

      dataClient.connect(port, ip, function () {
        console.log("Data connection established for RETR command");
        client.write(`RETR ${parseURL(remoteUrl).path}\r\n`);
      });

      // Open a file stream to write the downloaded data
      const fileStream = fs.createWriteStream(localPath);
      dataClient.on("data", function (data) {
        console.log("Receiving data...");
        fileStream.write(data);
      });

      dataClient.on("end", function () {
        console.log("File download completed.");
        fileStream.end(); // Close the file stream
        client.end(); // Close control connection
      });

      client.once("data", function (response) {
        console.log("RETR Response: ", response.toString());
        // Handle server response to the RETR command
        if (!response.toString().startsWith("150")) {
          console.error("Failed to start file transfer.");
          fileStream.end(); // Ensure file stream is closed on error
          dataClient.end(); // Close data connection on error
        }
      });
    });
  });
}

// Function to upload a file from local to remote FTP
function uploadFileToFtp(localPath, remoteUrl) {
  connectToFtpServer(remoteUrl, function (error, client) {
    if (error) {
      console.error("Failed to connect or log in:", error.message);
      return;
    }

    openDataConnection(client, function (error, { ip, port }) {
      if (error) {
        console.error("Failed to open data connection:", error.message);
        client.end(); // Close control connection
        return;
      }

      const dataClient = new net.Socket();

      // Once the data connection is established, send the STOR command
      dataClient.connect(port, ip, function () {
        console.log("Data connection established for STOR command");
        client.write(`STOR ${parseURL(remoteUrl).path}\r\n`);
      });

      // Handle the server's response to the STOR command
      client.once("data", function (response) {
        console.log("STOR Response: ", response.toString());
        if (response.toString().startsWith("150")) {
          // Server is ready to receive the file data
          fs.createReadStream(localPath)
            .pipe(dataClient)
            .on("finish", function () {
              console.log("File upload completed.");
              client.end(); // Close control connection after the upload is complete
            });
        } else {
          console.error("Failed to start file transfer.");
          dataClient.end(); // Close data connection on error
        }
      });
    });
  });
}

// Helper function for copying files
function copyFile(source, destination, isMove = false) {
  // Determine if source is remote
  if (source.startsWith("ftp://")) {
    // Handle download (remote to local)
    // Similar to handleLsCommand, but use RETR and write file locally
  } else if (destination.startsWith("ftp://")) {
    // Handle upload (local to remote)
    // Similar to handleLsCommand, but use STOR and read file locally
  }

  // If isMove is true, delete the source file after successful transfer
}

// Modify the handleCpCommand to include the download functionality
function handleCpCommand(source, destination) {
  if (!source.startsWith("ftp://") && destination.startsWith("ftp://")) {
    // Upload file from local path to FTP
    uploadFileToFtp(source, destination);
  } else if (source.startsWith("ftp://")) {
    // Download functionality is already implemented
    console.error("Download functionality is already implemented.");
  } else {
    console.error(
      "Copy command currently supports only local-to-remote and remote-to-local copying."
    );
  }
}

function handleMvCommand(source, destination) {
  copyFile(source, destination, true);
}

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
