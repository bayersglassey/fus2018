
#include "util.h"

char *load_file(const char *filename){
    FILE *f = fopen(filename, "r");
    long f_size;
    char *f_buffer;
    size_t n_read_bytes;
    if(f == NULL){
        fprintf(stderr, "Could not open file: %s\n", filename);
        return NULL;
    }

    fseek(f, 0, SEEK_END);
    f_size = ftell(f);
    fseek(f, 0, SEEK_SET);

    f_buffer = calloc(f_size + 1, 1);
    if(f_buffer == NULL){
        fprintf(stderr, "Could not allocate buffer for file: %s (%li bytes)\n", filename, f_size);
        fclose(f);
        return NULL;
    }
    n_read_bytes = fread(f_buffer, 1, f_size, f);
    fclose(f);
    return f_buffer;
}

char *fus_write_long_int(char *buffer, size_t buffer_size, long int i){
    /* On success, returns pointer to start of written string.
    On failure (e.g. buffer is too small), returns NULL. */
    char *s = &buffer[buffer_size - 1];
    *s = '\0';
    bool neg = i < 0;
    if(neg)i = -i;
    while(i){
        char digit = (i % 10) + '0';
        i /= 10;
        if(s == buffer)return NULL;
        s--;
        *s = digit;
    }
    if(neg){
        if(s == buffer)return NULL;
        s--;
        *s = '-';
    }
    return s;
}
