FROM node:18

WORKDIR /app
COPY package*.json ./

RUN yarn install

COPY . .

RUN yarn global add typescript@5.1
RUN tsc

CMD [ "node", "./build/index.js" ]