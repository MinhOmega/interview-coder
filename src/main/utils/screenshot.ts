import { desktopCapturer } from 'electron';
import * as fs from 'fs-extra';
import * as path from 'path';
import screenshot from 'screenshot-desktop';
import { AreaSelection } from '../types';

/**
 * Captures a full screenshot and saves it to the given path
 * @param imagePath Path to save the screenshot
 * @returns Promise with the image dimensions
 */
export async function captureScreenshot(imagePath: string): Promise<{ width: number; height: number }> {
  try {
    console.log(`Taking screenshot and saving to: ${imagePath}`);
    
    // Ensure the directory exists
    await fs.ensureDir(path.dirname(imagePath));
    
    // Take the screenshot
    await screenshot({ filename: imagePath });
    
    // Read the file to verify it exists and get its dimensions
    const imageBuffer = await fs.readFile(imagePath);
    
    if (!imageBuffer || imageBuffer.length < 1000) {
      throw new Error('Screenshot appears to be empty or invalid');
    }
    
    // For proper dimensions we would need an image processing library
    // For now, return a placeholder (this would be better with sharp or jimp)
    const dimensions = { width: 1920, height: 1080 };
    
    console.log(`Screenshot saved successfully: ${imagePath}`);
    return dimensions;
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    throw new Error(`Failed to capture screenshot: ${(error as Error).message}`);
  }
}

/**
 * Captures a screenshot of a selected area and saves it to the given path
 * @param selection Area to capture
 * @param imagePath Path to save the screenshot
 * @returns Promise with the base64-encoded image data
 */
export async function captureAreaScreenshot(
  selection: AreaSelection, 
  imagePath: string
): Promise<string> {
  try {
    console.log(`Taking area screenshot with dimensions ${selection.width}x${selection.height} at (${selection.x},${selection.y})`);
    
    // Ensure the directory exists
    await fs.ensureDir(path.dirname(imagePath));
    
    // Get available screen sources
    const sources = await desktopCapturer.getSources({ 
      types: ['screen'],
      thumbnailSize: { width: selection.width, height: selection.height }
    });
    
    if (!sources || sources.length === 0) {
      console.error('No screen sources found for area capture');
      
      // Fallback to full screenshot and crop afterward
      console.log('Falling back to full screenshot method');
      await screenshot({ filename: imagePath });
      
      // Here we would normally crop the image using sharp or jimp
      // But for now, just return empty base64 as placeholder
      return '';
    }
    
    // Use the first screen source
    const source = sources[0];
    
    // Get the thumbnail data
    const thumbnail = source.thumbnail.toDataURL();
    
    // Convert base64 to buffer and save to file
    const base64Data = thumbnail.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(imagePath, buffer);
    
    console.log(`Area screenshot saved successfully: ${imagePath}`);
    return thumbnail;
  } catch (error) {
    console.error('Error capturing area screenshot:', error);
    throw new Error(`Failed to capture area screenshot: ${(error as Error).message}`);
  }
}