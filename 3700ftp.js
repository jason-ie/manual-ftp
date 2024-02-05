// Importing necessary modules
const ftp = require("ftp"); // Allows Node.js to manage files on remote servers and easily connect to FTP server
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
  .help("h") // Adds help option to command line arguments
  .alias("h", "help").argv;

const command = argv._[0]; // Get the command from the command line arguments

// Establish FTP Connection by parsing the URL provided in the command line
function parseURL(ftpUrl) {
  const parsedUrl = url.parse(ftpUrl); // Parses the FTP URL, returns object containing all parts
  const path = parsedUrl.pathname; // Extracts path section from the URL
  let [user, password] = (parsedUrl.auth || "anonymous:").split(":"); // Gets the authentication part of the URL, splits it into user and password
  return {
    host: parsedUrl.hostname, // Returns the hostname from the URL
    port: parsedUrl.port || 21, // Returns the port from the URL, defaults to 21 if not provided
    user, // Returns the user
    password, // Returns the password
    path, // Returns the path
  }; // Returns an object containing the host, port, user, password, and path
}

// Create a new FTP client
const client = new ftp();

// Implementing the FTP operations (command line arguments)
// List directory contents function
function listDir(client, url, cb) {
  const { host, port, user, password, path } = parseURL(url); // Parses the FTP URL and extracts the host, port, user, password, and path
  client.on("ready", function () {
    // When client is ready, send list command to server and retrieve list of files/directories at path
    client.list(path, function (err, list) {
      if (err) {
        // console.error(`Error listing directory: ${err.message}`);
        client.end();
        cb(err); // Passes the error to the callback for further handling
        return; // Return early to prevent further execution
      }
      //   console.log(list); // Log the list of files/directories
      //   console.log(`Listed ${list.length} items in directory`); // Log the number of items in the directory
      client.end(); // End the connection to the FTP server
      cb(); // Call the callback function
    });
  });
  client.connect({ host, port, user, password }); // Initiate connection to FTP server
}

// Make directory function
function makeDir(client, url, cb) {
  const { host, port, user, password, path } = parseURL(url); // Parses the FTP URL and extracts the host, port, user, password, and path
  client.on("ready", function () {
    // When client is ready, send make directory command to server and create directory at path
    client.mkdir(path, true, function (err) {
      if (err) {
        // console.log(`Error creating directory: ${err.message}`); // Log error message
        client.end();
        cb(err); // Passes the error to the callback for further handling
        return; // Return early to prevent further execution
      }
      //   console.log(`Directory created at ${path}`); // Log success message
      client.end(); // End the connection to the FTP server
      cb(); // Call the callback function
    });
  });
  client.connect({ host, port, user, password }); // Initiate connection to FTP server
}

// Remove file function
function removeFile(client, url, cb) {
  const { host, port, user, password, path } = parseURL(url); // Parses the FTP URL and extracts the host, port, user, password, and path
  client.on("ready", function () {
    // When client is ready, send remove file command to server and remove file at path
    client.delete(path, function (err) {
      if (err) {
        // console.log(`Error removing file: ${err.message}`); // Log error message
        client.end();
        cb(err); // Passes the error to the callback for further handling
        return; // Return early to prevent further execution
      }
      //   console.log(`File removed at ${path}`); // Log success message
      client.end(); // End the connection to the FTP server
      cb(); // Call the callback function
    });
  });
  client.connect({ host, port, user, password }); // Initiate connection to FTP server
}

// Remove directory function
function removeDir(client, url, cb) {
  const { host, port, user, password, path } = parseURL(url); // Parses the FTP URL and extracts the host, port, user, password, and path
  client.on("ready", function () {
    // When client is ready, send remove directory command to server and remove directory at path
    client.rmdir(path, true, function (err) {
      if (err) {
        // console.error(`Error removing directory: ${err.message}`); // Log error message
        client.end();
        cb(err); // Passes the error to the callback for further handling
        return; // Return early to prevent further execution
      }
      //   console.log(`Directory removed at ${path}`); // Log success message
      client.end(); // End the connection to the FTP server
      cb(); // Call the callback function
    });
  });
  client.connect({ host, port, user, password }); // Initiate connection to FTP server
}

// Helper function for copy and move file to determine whether the path is for a local file
function isLocalPath(path) {
  return !path.startsWith("ftp://"); // Returns false if the path starts with "ftp://" (denotes a remote file)
}

// Downloads a file from FTP server to local file system
function downloadFile(client, remotePath, localPath, cb) {
  client.get(remotePath, function (err, stream) {
    // Downloads file from the FTP server
    if (err) {
      console.error(`Download error: ${err.message}`); // Log error message
      return cb(err);
    }
    stream.once("close", () => {
      // Setting up close event listener on stream object
      //   console.log("Download completed."); // Log success message
      cb(null); // No error has occurred
    });
    stream.pipe(fs.createWriteStream(localPath)); // Writes downloaded file data to file at desired path on local file system
  });
}

// Uploads a file from local file system to FTP server
function uploadFile(client, localPath, remotePath, cb) {
  //   console.log(`Attempting to upload from ${localPath} to ${remotePath}`); // Log upload attempt
  client.put(localPath, remotePath, function (err) {
    // Put function uploads file to the FTP server
    if (err) {
      console.error(`Upload error: ${err.message}`); // Log error message
      return cb(err);
    }
    // console.log("Upload completed."); // Log success message
    cb(null); // No error has occurred
  });
}

// Copy file from source to destination function
function copyFile(source, destination, cb) {
  if (isLocalPath(source) && !isLocalPath(destination)) {
    // If source and destination are valid paths for uploading, Upload scenario: Local to FTP
    const {
      host,
      port,
      user,
      password,
      path: remotePath,
    } = parseURL(destination);
    const uploadClient = new ftp(); // Create new FTP client
    uploadClient
      .on("ready", () => {
        // console.log(`Connected to FTP server for upload.`); // Log success message
        // Now connected, proceed with the file upload
        uploadFile(uploadClient, source, remotePath, (err) => {
          uploadClient.end(); // Close the FTP connection after the operation
          cb(err); // Passes the error to the callback for further handling
        });
      })
      .on("error", (err) => {
        // console.error(`FTP error: ${err.message}`); // Log error message
        cb(err);
      });
    uploadClient.connect({ host, port, user, password }); // Initiate FTP connection
  } else if (!isLocalPath(source) && isLocalPath(destination)) {
    // If source and destination are valid paths for downloading, Download scenario: FTP to Local
    const { host, port, user, password, path: remotePath } = parseURL(source);
    const downloadClient = new ftp(); // Create new FTP client for downloading purposes
    downloadClient
      .on("ready", () => {
        // console.log(`Connected to FTP server for download.`);
        // Now connected, proceed with the file download
        downloadFile(downloadClient, remotePath, destination, (err) => {
          downloadClient.end(); // Close the FTP connection after the operation
          cb(err);
        });
      })
      .on("error", (err) => {
        // console.error(`FTP error: ${err.message}`);
        cb(err);
      });
    downloadClient.connect({ host, port, user, password }); // Initiate the FTP connection
  } else {
    // If source and destination are not valid paths for copying
    cb(new Error("Invalid source or destination for copy operation.")); // Passes an error to the callback for further handling
  }
}

// Move file from source to destination function
function moveFile(source, destination, cb) {
  // Copy the file from source to destination
  copyFile(source, destination, (copyErr) => {
    if (copyErr) {
      //   console.error(`Move operation failed during copy: ${copyErr.message}`); // Log error message
      return cb(copyErr); // Passes the error to the callback for further handling
    }

    // Remove the original source file now that we have copied it
    if (isLocalPath(source) && !isLocalPath(destination)) {
      // If moving from local to FTP, delete the local file (upload operation completed)
      fs.unlink(source, (unlinkErr) => {
        // Unlink function deletes the file from the local file system
        if (unlinkErr) {
          //   console.error(
          //     `Failed to delete local source file after moving: ${unlinkErr.message}` // Log error message
          //   );
          return cb(unlinkErr);
        }
        // console.log(`Moved file successfully from ${source} to ${destination}`);
        cb(null); // Successfully moved
      });
    } else if (!isLocalPath(source) && isLocalPath(destination)) {
      // If moving from FTP to local, delete the file from FTP server, (download operation completed)
      const { host, port, user, password, path: remotePath } = parseURL(source); // Parse the source URL
      const deleteClient = new ftp(); // Create new FTP client for deleting the file from the FTP server
      deleteClient
        .on("ready", () => {
          deleteClient.delete(remotePath, (deleteErr) => {
            // Delete the file from the FTP server
            deleteClient.end(); // Always close the client after operation
            if (deleteErr) {
              //   console.error(
              //     `Failed to delete remote source file after moving: ${deleteErr.message}` // Log error message
              //   );
              return cb(deleteErr); // Passes the error to the callback for further handling
            }
            // console.log(
            //   `Moved file successfully from ${source} to ${destination}` // Log success message
            // );
            cb(null); // Successfully moved
          });
        })
        .on("error", (err) => {
          //   console.error(`FTP error during delete: ${err.message}`); // Log error message
          cb(err);
        });
      deleteClient.connect({ host, port, user, password }); // Initiate FTP connection
    } else {
      cb(new Error("Invalid source or destination for move operation.")); // Passes an error to the callback for further handling
    }
  });
}

let source = argv.source; // Extract the source from the arguments
let destination = argv.destination; // Extract the destination from the arguments

switch (command) {
  case "ls": // If command is ls, list directory
    listDir(client, argv.url, function (err) {
      if (!err) {
        // console.log("Listed directory successfully."); // Log success message
      } // Errors are logged in the listDir function
    });
    break;
  case "mkdir": // If command is mkdir, make directory
    makeDir(client, argv.url, function (err) {
      if (!err) {
        // console.log("Directory created successfully."); // Log success message
      } // Errors are logged in the makeDir function
    });
    break;
  case "rm": // If command is rm, remove file
    removeFile(client, argv.url, function (err) {
      if (!err) {
        // console.log("File removed successfully."); // Log success message
      } // Errors are logged in the removeFile function
    });
    break;
  case "rmdir": // If command is rmdir, remove directory
    removeDir(client, argv.url, function (err) {
      if (!err) {
        // console.log("Directory removed successfully."); // Log success message
      } // Errors are logged in the removeDir function
    });
    break;
  case "cp": // If command is cp, copy file
    // console.log(`source: ${source}, destination: ${destination}`);
    copyFile(source, destination, (err) => {
      if (err) {
        // console.log(`Copy operation failed: ${err.message}`); // Log error message
      } else {
        console
          .log
          //   `File successfully copied from ${source} to ${destination}` // Log success message
          ();
      }
    });
    break;
  case "mv": // If command is mv, move file
    moveFile(source, destination, (err) => {
      if (err) {
        // console.error(`Move operation failed: ${err.message}`); // Log error message
      }
    });
    break;
  default: // If the command doesn't match any of the cases, log an error
    // console.log("Command not recognized"); // Send error message to console
    break;
}
