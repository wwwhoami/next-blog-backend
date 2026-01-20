#!/bin/bash
set -e

# Start Kafka in the background
/opt/bitnami/scripts/kafka/entrypoint.sh /opt/bitnami/scripts/kafka/run.sh &

# Wait for Kafka to be ready
echo "Waiting for Kafka to be ready..."
until /opt/bitnami/kafka/bin/kafka-cluster.sh cluster-id --bootstrap-server "${KAFKA_HOST_INTERNAL}":"${KAFKA_PORT_INTERNAL}" &>/dev/null; do
	sleep 1
done

echo "Kafka is ready. Initializing topics..."

# Run the topic initialization
/opt/bitnami/kafka/bin/kafka-topics.sh --bootstrap-server "${KAFKA_HOST_INTERNAL}":"${KAFKA_PORT_INTERNAL}" --topic notification.mark-as-read --create --if-not-exists
/opt/bitnami/kafka/bin/kafka-topics.sh --bootstrap-server "${KAFKA_HOST_INTERNAL}":"${KAFKA_PORT_INTERNAL}" --topic notification.get-many --create --if-not-exists
/opt/bitnami/kafka/bin/kafka-topics.sh --bootstrap-server "${KAFKA_HOST_INTERNAL}":"${KAFKA_PORT_INTERNAL}" --topic notification.mark-as-read.reply --create --if-not-exists
/opt/bitnami/kafka/bin/kafka-topics.sh --bootstrap-server "${KAFKA_HOST_INTERNAL}":"${KAFKA_PORT_INTERNAL}" --topic notification.get-many.reply --create --if-not-exists
/opt/bitnami/kafka/bin/kafka-topics.sh --bootstrap-server "${KAFKA_HOST_INTERNAL}":"${KAFKA_PORT_INTERNAL}" --topic comment.create --create --if-not-exists
/opt/bitnami/kafka/bin/kafka-topics.sh --bootstrap-server "${KAFKA_HOST_INTERNAL}":"${KAFKA_PORT_INTERNAL}" --topic comment.like --create --if-not-exists
/opt/bitnami/kafka/bin/kafka-topics.sh --bootstrap-server "${KAFKA_HOST_INTERNAL}":"${KAFKA_PORT_INTERNAL}" --topic comment.unlike --create --if-not-exists
/opt/bitnami/kafka/bin/kafka-topics.sh --bootstrap-server "${KAFKA_HOST_INTERNAL}":"${KAFKA_PORT_INTERNAL}" --topic post.like --create --if-not-exists
/opt/bitnami/kafka/bin/kafka-topics.sh --bootstrap-server "${KAFKA_HOST_INTERNAL}":"${KAFKA_PORT_INTERNAL}" --topic post.unlike --create --if-not-exists

echo "Kafka topics initialized."

# Keep the container running
wait
