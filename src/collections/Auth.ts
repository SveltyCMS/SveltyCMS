export let user = {
  _id: {
    type: String,
  },
  provider_id: {
    type: String,
    unique: true,
    required: true,
  },
  username: String,
  hashed_password: String,
};

export let session = {
  _id: {
    type: String,
  },
  user_id: {
    type: String,
    required: true,
  },
  expires: {
    type: Number,
    required: true,
  },
  idle_expires: {
    type: Number,
    required: true,
  },
};
