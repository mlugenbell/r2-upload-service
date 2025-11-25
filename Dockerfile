FROM node:18

# Install ffmpeg for audio duration detection
RUN apt-get update && apt-get install -y ffmpeg && apt-get clean

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
