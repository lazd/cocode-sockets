# cocode-sockets
> A socket-based version of CoCode for code sharing only

## Usage

```
# Install dependencies
npm install
# Perform a build
grunt build-prod
# Start the server
node server/server.js &
# Open the app
open http://localhost:3000/?MyName@interview-name
```

## Production

To perform a production build, run the `prod` npm script:

```
npm run prod
```

The `build/` folder will contain the client, ready for deployment.


## Development

Install dependencies as usual:

```
npm install
```

Run Grunt, which performs a dev build then watches for changes:

```
grunt
```

When you pull, be sure to perform another `npm install` in case packages were updates.
