FROM node:22-alpine
WORKDIR /home/app
ADD package*.json /home/app/
RUN npm i --omit=dev
ADD . /home/app/
RUN addgroup -S app --gid 1002 &&\
 adduser -S app -G app
USER app
ENTRYPOINT ["npm", "run", "server"]
