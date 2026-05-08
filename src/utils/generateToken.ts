import jwt from 'jsonwebtoken';
import { IUserDocument } from '../models/User';

const generateToken = (user: IUserDocument): string => {
  const { JWT_SECRET } = process.env;

  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined');
  }

  const token = jwt.sign(
    { id: user._id, username: user.username },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  return token;
};

export default generateToken;
