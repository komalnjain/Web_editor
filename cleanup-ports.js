import { exec } from 'child_process';

/**
 * Kills processes running on a specific port
 * @param {number} port - The port number to check
 * @returns {Promise<void>}
 */
function killProcessOnPort(port) {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    let command;

    if (platform === 'win32') {
      // Windows command
      command = `netstat -ano | findstr :${port}`;
    } else {
      // Linux/Mac command
      command = `lsof -i :${port} -t`;
    }

    exec(command, (error, stdout, stderr) => {
      if (error) {
        // If there's an error, it might mean no process is using the port
        console.log(`No process found on port ${port} or command failed`);
        resolve();
        return;
      }

      const pids = stdout.toString().match(/\d+/g);
      if (pids && pids.length > 0) {
        // Filter out duplicate PIDs
        const uniquePids = [...new Set(pids)];
        
        // Create an array of promises for each kill operation
        const killPromises = uniquePids.map(pid => {
          return new Promise((resolveKill) => {
            try {
              const killCommand = platform === 'win32' 
                ? `taskkill /F /PID ${pid}` 
                : `kill -9 ${pid}`;
                
              exec(killCommand, (killError) => {
                if (killError) {
                  console.log(`Failed to kill process ${pid}:`, killError.message);
                } else {
                  console.log(`Killed process ${pid} on port ${port}`);
                }
                resolveKill(); // Always resolve, even on error
              });
            } catch (err) {
              console.log(`Error executing kill command for process ${pid}:`, err);
              resolveKill(); // Always resolve, even on error
            }
          });
        });
        
        // Wait for all kill operations to complete
        Promise.all(killPromises)
          .then(() => resolve())
          .catch(err => {
            console.error('Error in kill operations:', err);
            resolve(); // Still resolve the main promise
          });
      } else {
        console.log(`No process found on port ${port}`);
        resolve();
      }
    });
  });
}

/**
 * Cleans up specified ports by killing processes
 */
async function cleanup() {
  console.log('Cleaning up ports...');
  try {
    await Promise.all([
      killProcessOnPort(3000),
      killProcessOnPort(3003)
    ]);
    console.log('Ports cleanup completed');
  } catch (error) {
    console.error('Error during ports cleanup:', error);
    process.exit(1); // Exit with error code
  }
}

// Execute cleanup
cleanup(); 