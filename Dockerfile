FROM node:22.9

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./

RUN npm install

# Bundle app source
COPY . .

# Build the app
RUN npm run build

EXPOSE 1053

CMD [ "node", "dist/index.js" ]
