import { existsSync } from 'fs';
import { intro, outro, text, select, isCancel, cancel, clear } from '@clack/prompts';

// Function to clear the terminal
const clearTerminal = () => {
  clear(); // Clack's clear function
};

// Function to validate email address
const isValidEmail = (email) => {
  const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(String(email).toLowerCase());
};

// Function to configure email settings
const configureEmail = async () => {
  const emailConfig = await text({
    message: 'Enter your email address:',
    validate: (input) => isValidEmail(input) ? true : 'Please enter a valid email address.'
  });

  if (isCancel(emailConfig)) {
    cancel('Email configuration cancelled.');
    return;
  }

  // Save email configuration logic here

  const saveEmail = await select({
    message: 'Would you like to save the email configuration?',
    options: [
      { value: 'save', label: 'Save' },
      { value: 'cancel', label: 'Cancel' }
    ]
  });

  if (saveEmail === 'save') {
    console.log('Email configuration saved.');
    return emailConfig; // Return the email configuration data
  } else {
    cancel('Email configuration not saved.');
    return;
  }
};

// Database connection details
const databaseConfig = {
  DB_HOST: 'mongodb://localhost:27017/',
  DB_NAME: 'SvelteCMS',
  DB_USER: 'admin',
  DB_PASSWORD: 'admin'
};

// Main installer function
const mainInstaller = async () => {
  if (!checkFileExists()) {
    intro('Welcome to the SveltyCMS Installer');

    let emailCompleted = false;
    let databaseCompleted = false;

    while (!emailCompleted || !databaseCompleted) {
      clearTerminal(); // Clear the terminal before showing the main menu

      const configChoice = await select({
        message: 'Select the configuration you want to set up:',
        options: [
          { value: 'database', label: 'Database', disabled: databaseCompleted },
          { value: 'email', label: 'Email', disabled: emailCompleted }
        ]
      });

      if (isCancel(configChoice)) {
        cancel('Setup cancelled.');
        process.exit(0);
      }

      switch (configChoice) {
        case 'email':
          const emailData = await configureEmail();
          emailCompleted = !!emailData;
          break;
        case 'database':
          // Use the databaseConfig object here for your setup
          console.log('Database configuration complete.');
          databaseCompleted = true;
          break;
      }
    }

    outro('SveltyCMS setup is complete.');
  } else {
    console.log('/config/private.ts already exists. No further setup is required.');
  }
};

mainInstaller();
