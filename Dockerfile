FROM node:14-alpine
ADD . /home/app
RUN npm update
RUN addgroup -S app &&\
 adduser -S app -G app
USER app
WORKDIR /home/app
ENTRYPOINT ["npm", "run", "server"]
