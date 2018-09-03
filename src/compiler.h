#ifndef _FUS_COMPILER_H_
#define _FUS_COMPILER_H_


/******************
 * COMPILER BLOCK *
 ******************/

enum {
    FUS_COMPILER_BLOCK_TYPE_PAREN,
    FUS_COMPILER_BLOCK_TYPE_DO,
    FUS_COMPILER_BLOCK_TYPE_IF,
    FUS_COMPILER_BLOCK_TYPE_IFELSE_A,
    FUS_COMPILER_BLOCK_TYPE_IFELSE_B,
    FUS_COMPILER_BLOCK_TYPES
};

typedef struct fus_compiler_block {
    int type;
    int depth;
    fus_code_t *code;
    int opcode_i;
    char *label_name;
} fus_compiler_block_t;

void fus_compiler_block_cleanup(fus_compiler_block_t *block);
int fus_compiler_block_init(fus_compiler_block_t *block, int type,
    int depth, fus_code_t *code, char *label_name);
int fus_compiler_block_finish(fus_compiler_block_t *block,
    fus_symtable_t *symtable);


/******************
 * COMPILER FRAME *
 ******************/

enum {
    FUS_COMPILER_FRAME_TYPE_NONE,
    FUS_COMPILER_FRAME_TYPE_DEF,
    FUS_COMPILER_FRAME_TYPE_REF,
    FUS_COMPILER_FRAME_TYPE_SIG,
    FUS_COMPILER_FRAME_TYPES
};

#define FUS_COMPILER_FRAME_TYPE_ANY (-1)

typedef struct fus_compiler_frame {
    int i;
    struct fus_compiler_frame *parent;
    int depth;
    int pos;
    int row;
    int col;

    char *name;
    bool compiled;
    int type;
    union {
        struct {
            char *load_path;
            bool is_module;
            fus_code_t code;
            struct fus_compiler_frame *sig_frame;
        } def;
        fus_signature_t sig;
        struct fus_compiler_frame *ref;
    } data;
} fus_compiler_frame_t;


void fus_compiler_frame_cleanup(fus_compiler_frame_t *frame);
int fus_compiler_frame_init(fus_compiler_frame_t *frame, int i,
    fus_compiler_frame_t *parent, char *name, int pos, int row, int col);
int fus_compiler_frame_init_def(fus_compiler_frame_t *frame, bool is_module);
int fus_compiler_frame_init_sig(fus_compiler_frame_t *frame);

int fus_compiler_frame_to_ref(fus_compiler_frame_t *frame,
    fus_compiler_frame_t *other_frame);

const char *fus_compiler_frame_type_to_s(fus_compiler_frame_t *frame);
void fus_compiler_frame_debug_info(fus_compiler_frame_t *frame, FILE *f,
    int depth);



/************
 * COMPILER *
 ************/

typedef struct fus_compiler {
    fus_symtable_t *symtable;
    fus_lexer_t *lexer;
    fus_compiler_frame_t *cur_frame;
    fus_compiler_frame_t *root_frame;
    ARRAY_DECL(fus_compiler_frame_t*, frames)
} fus_compiler_t;

void fus_compiler_cleanup(fus_compiler_t *compiler);
int fus_compiler_init(fus_compiler_t *compiler, fus_symtable_t *symtable);

int fus_compiler_get_root_frame(fus_compiler_t *compiler,
    fus_compiler_frame_t **frame_ptr);
int fus_compiler_get_frame(fus_compiler_t *compiler, int i,
    bool follow_refs, fus_compiler_frame_t **frame_ptr);

int fus_compiler_add_frame(fus_compiler_t *compiler,
    fus_compiler_frame_t *parent, char *name,
    fus_compiler_frame_t **frame_ptr);
int fus_compiler_add_frame_def(fus_compiler_t *compiler,
    fus_compiler_frame_t *parent, char *name,
    bool is_module, fus_compiler_frame_t **frame_ptr);
int fus_compiler_add_frame_sig(fus_compiler_t *compiler,
    fus_compiler_frame_t *parent, char *name,
    fus_compiler_frame_t **frame_ptr);
int fus_compiler_add_frame_ref(fus_compiler_t *compiler,
    fus_compiler_frame_t *parent, char *name,
    fus_compiler_frame_t *other_frame,
    fus_compiler_frame_t **frame_ptr);

int fus_compiler_push_frame_def(fus_compiler_t *compiler,
    fus_compiler_frame_t *frame);
int fus_compiler_pop_frame_def(fus_compiler_t *compiler);
int fus_compiler_finish_def(fus_compiler_t *compiler,
    fus_compiler_frame_t *def);

int fus_compiler_find_frame(
    fus_compiler_t *compiler, fus_compiler_frame_t *parent,
    const char *token, int token_len,
    int type, fus_compiler_frame_t **frame_ptr);
int fus_compiler_find_frame_def(
    fus_compiler_t *compiler, fus_compiler_frame_t *parent,
    const char *token, int token_len,
    bool is_module, fus_compiler_frame_t **frame_ptr);
int fus_compiler_find_frame_sig(
    fus_compiler_t *compiler, fus_compiler_frame_t *parent,
    const char *token, int token_len,
    fus_compiler_frame_t **frame_ptr);

int fus_compiler_find_or_add_frame_def(
    fus_compiler_t *compiler, fus_compiler_frame_t *parent,
    const char *token, int token_len,
    bool is_module, fus_compiler_frame_t **frame_ptr);
int fus_compiler_find_or_add_frame_sig(
    fus_compiler_t *compiler, fus_compiler_frame_t *parent,
    const char *token, int token_len,
    fus_compiler_frame_t **frame_ptr);


int fus_compiler_compile_frame_from_lexer(fus_compiler_t *compiler,
    fus_lexer_t *lexer, char *name, bool is_module, int depth,
    fus_compiler_frame_t **frame_ptr);
int fus_compiler_finish(fus_compiler_t *compiler);


#endif