FROM node:21.2.0

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./

RUN npm install

# Bundle app source
COPY . .

EXPOSE 1053

CMD [ "node", "dist/bundle.js" ]
