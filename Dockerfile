FROM node:22-slim

WORKDIR /home/app
ADD package*.json /home/app/
RUN npm install --omit=dev
ADD . /home/app/

# run as root to access /etc/letsencrypt
#RUN groupadd -g 1002 app && \
#    useradd -m -g app -u 1002 app
#USER app

ENTRYPOINT ["npm", "run", "server"]