import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import axios from 'axios'

export const fetchAddress = createAsyncThunk('address/fetchAddress', 
    async ({ getToken }, thunkAPI) => {
        try {
            const token = await getToken()
            const { data } = await axios.get('/api/address', {headers: { Authorization: `Bearer ${token}` }})
            return data ? data.addresses : []
        } catch (error) {
            return thunkAPI.rejectWithValue(error.response.data)
        }
    }
)


const addressSlice = createSlice({
    name: 'address',
    initialState: {
        list: [],
        error: null,
    },
    reducers: {
        addAddress: (state, action) => {
            state.list.push(action.payload)
        },
        clearAddresses: (state) => {
            state.list = [];
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder.addCase(fetchAddress.fulfilled, (state, action) => {
            state.list = action.payload;
            state.error = null;
        });
        builder.addCase(fetchAddress.rejected, (state, action) => {
            state.error = action.payload?.error || action.error?.message || 'Failed to fetch addresses';
            state.list = [];
        });
    }
});

export const { addAddress, clearAddresses } = addressSlice.actions

export default addressSlice.reducer