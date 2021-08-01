FROM node:14-alpine
ADD . /home/app
WORKDIR /home/app
RUN npm install
RUN addgroup -S app --gid 1002 &&\
 adduser -S app -G app
USER app
ENTRYPOINT ["npm", "run", "server"]
