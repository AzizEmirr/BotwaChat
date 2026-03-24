for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
  if [ -f "$f" ]; then
    echo "--- $f"
    sed -n '1,220p' "$f"
  fi
done
