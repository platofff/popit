FROM node:14-alpine
ADD . /home/app
WORKDIR /home/app
RUN npm install
RUN addgroup -S app &&\
 adduser -S app -G app
USER app
ENTRYPOINT ["npm", "run", "server"]
